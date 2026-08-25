import express from "express";
import path from "path";
import https from "https";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from 'dotenv';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, getDocs, collection, deleteDoc, updateDoc } from "firebase/firestore";
import webpush from "web-push";
import fs from "fs";

dotenv.config();

const PORT = 3000;

// Initialize Firebase App and Firestore for the backend push cron/subscription system
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// Lazy initialisation of the Gemini AI client to prevent startup crashes if GEMINI_API_KEY is unset
let aiInstance: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is required to process bank statements.");
    }
    aiInstance = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Setup VAPID keys for Web Push. They are loaded/persisted dynamically in Firestore.
  let publicVapidKey = "";
  let privateVapidKey = "";

  try {
    const vapidDocRef = doc(db, "system", "vapidKeys");
    const vapidSnap = await getDoc(vapidDocRef);
    if (vapidSnap.exists()) {
      const data = vapidSnap.data();
      publicVapidKey = data.publicKey;
      privateVapidKey = data.privateKey;
      console.log("[Push Server] Loaded existing VAPID keys from Firestore.");
    } else {
      const keys = webpush.generateVAPIDKeys();
      publicVapidKey = keys.publicKey;
      privateVapidKey = keys.privateKey;
      await setDoc(vapidDocRef, { publicKey: publicVapidKey, privateKey: privateVapidKey });
      console.log("[Push Server] Generated and saved new persistent VAPID keys to Firestore.");
    }

    webpush.setVapidDetails(
      "mailto:duverart.o@gmail.com",
      publicVapidKey,
      privateVapidKey
    );
  } catch (err) {
    console.error("[Push Server] Failed to setup VAPID keys:", err);
    // Dynamic memory fallback if Firestore is not accessible/empty
    const keys = webpush.generateVAPIDKeys();
    publicVapidKey = keys.publicKey;
    privateVapidKey = keys.privateKey;
    webpush.setVapidDetails("mailto:duverart.o@gmail.com", keys.publicKey, keys.privateKey);
  }

  // Background Web Push checker function
  async function checkAndSendPushReminders() {
    try {
      const usersSnap = await getDocs(collection(db, "users"));
      for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data();
        const timezone = userData.timezone || "America/Caracas";

        // Calculate user's current local time
        let userLocalTimeStr = "";
        try {
          userLocalTimeStr = new Date().toLocaleString("en-US", { timeZone: timezone });
        } catch (err) {
          userLocalTimeStr = new Date().toLocaleString("en-US", { timeZone: "America/Caracas" });
        }
        const userDate = new Date(userLocalTimeStr);
        const userHH = String(userDate.getHours()).padStart(2, "0");
        const userMM = String(userDate.getMinutes()).padStart(2, "0");
        const localHHMM = `${userHH}:${userMM}`;
        const todayStr = `${userDate.getFullYear()}-${String(userDate.getMonth() + 1).padStart(2, "0")}-${String(userDate.getDate()).padStart(2, "0")}`;

        // Fetch user's habits from Firestore subcollection
        const habitsSnap = await getDocs(collection(db, "users", userId, "habits"));
        const habits = habitsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

        for (const habit of habits) {
          if (habit.reminderActive && habit.reminderTime === localHHMM) {
            const isCompletedToday = habit.history && habit.history[todayStr];
            if (!isCompletedToday) {
              if (habit.lastNotifiedDate !== todayStr) {
                // Fetch user push subscriptions
                const subsSnap = await getDocs(collection(db, "users", userId, "pushSubscriptions"));
                
                if (!subsSnap.empty) {
                  console.log(`[Push Server] Triggering background push for ${userData.username || userId} -> Habit: ${habit.name} at ${localHHMM} (${timezone})`);
                  
                  const payload = JSON.stringify({
                    title: "Recordatorio de Hábito",
                    body: `¡Hola, ${userData.username || "amigo"}! Es momento de realizar tu hábito de hoy: ${habit.name}. ✨`,
                    tag: `habit-${habit.id}`,
                    url: "/habitos"
                  });

                  for (const subDoc of subsSnap.docs) {
                    const subData = subDoc.data();
                    try {
                      await webpush.sendNotification(subData.subscription, payload);
                    } catch (pushErr: any) {
                      if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
                        await deleteDoc(doc(db, "users", userId, "pushSubscriptions", subDoc.id));
                        console.log(`[Push Server] Removed expired subscription ${subDoc.id} for user ${userId}`);
                      } else {
                        console.error(`[Push Server] Error sending push to sub ${subDoc.id}:`, pushErr.message);
                      }
                    }
                  }
                }

                // Update the habit doc's lastNotifiedDate to avoid multiple push fires in the same minute
                await updateDoc(doc(db, "users", userId, "habits", habit.id), {
                  lastNotifiedDate: todayStr
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("[Push Server] Error in checkAndSendPushReminders:", err);
    }
  }

  // Launch background cron/interval checking every 60 seconds
  setInterval(async () => {
    try {
      await checkAndSendPushReminders();
    } catch (err) {
      console.error("[Push Server] Error running background check loop:", err);
    }
  }, 60000);

  // Web Push API routes
  app.get("/api/push/public-key", (req, res) => {
    res.json({ publicKey: publicVapidKey });
  });

  app.post("/api/push/subscribe", async (req, res) => {
    const { userId, subscription, timezone } = req.body;
    if (!userId || !subscription) {
      return res.status(400).json({ error: "Missing userId or subscription fields" });
    }

    try {
      const subId = subscription.endpoint.split("/").pop() || "sub-" + Date.now();
      const subRef = doc(db, "users", userId, "pushSubscriptions", subId);
      
      await setDoc(subRef, {
        subscription,
        timezone: timezone || "America/Caracas",
        createdAt: new Date().toISOString(),
        userId
      });

      // Maintain timezone sync on parent profile doc as well
      await setDoc(doc(db, "users", userId), { timezone: timezone || "America/Caracas" }, { merge: true });

      console.log(`[Push Server] Successfully registered Web Push subscription for ${userId}: ${subId} (${timezone})`);
      res.json({ success: true, id: subId });
    } catch (err: any) {
      console.error("[Push Server] Error in /api/push/subscribe:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API routes
  app.post("/api/parse-statement", async (req, res) => {
    const { imageBase64, mimeType } = req.body;
    
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: {
          parts: [
            {
              inlineData: {
                data: imageBase64,
                mimeType: mimeType,
              },
            },
            {
              text: "Analiza esta captura de pantalla de un estado de cuenta, recibo o comprobante bancario. Identifica el nombre del banco emisor (por ejemplo: Mercantil, Banesco, Banco de Venezuela, BBVA Provincial, Bancamiga, etc.) y colócalo en 'bankName' (usar 'Banco de la captura' o similar si no es claro). Luego extrae todas las transacciones individuales y colócalas en 'transactions'. Cada transacción debe incluir 'date' (formato YYYY-MM-DD), 'description' (string), 'amount' (number) y 'type' ('income' o 'expense').",
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              bankName: { type: Type.STRING },
              transactions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    date: { type: Type.STRING },
                    description: { type: Type.STRING },
                    amount: { type: Type.NUMBER },
                    type: { type: Type.STRING },
                  },
                  required: ["date", "description", "amount", "type"],
                },
              },
            },
            required: ["bankName", "transactions"],
          },
        },
      });

      res.json(JSON.parse(response.text));
    } catch (error) {
      console.error("Error parsing statement:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to parse statement" });
    }
  });

  // Personal Assistant Chat Route
  app.post("/api/assistant/chat", async (req, res) => {
    const { messages } = req.body;
    
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: messages,
        config: {
          systemInstruction: "Eres Aura, un asistente personal inteligente y sofisticado con estilo minimalista. Ayudas al usuario a organizar su vida diaria: tareas pendientes, notas personales, registro de hábitos y finanzas personales. Tu tono es empático, conciso, motivador y sumamente claro. Da sugerencias breves, prácticas y estructuradas en español.",
        }
      });
      res.json({ text: response.text });
    } catch (error) {
      console.error("Error in assistant chat:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate assistant response" });
    }
  });

  // Fetch live BCV Exchange Rate
  app.get("/api/bcv-rate", async (req, res) => {
    const fetchBypassTLS = (urlStr: string, customHeaders: Record<string, string> = {}, timeoutMs = 3500): Promise<string> => {
      return new Promise((resolve, reject) => {
        try {
          const parsed = new URL(urlStr);
          const request = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            rejectUnauthorized: false, // Prevents certificate verification failures (such as BCV's invalid chain)
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
              'Accept': '*/*',
              ...customHeaders
            },
            timeout: timeoutMs
          }, (response) => {
            let body = '';
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
              if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
                resolve(body);
              } else {
                reject(new Error(`Status ${response.statusCode}`));
              }
            });
          });
          request.on('error', (err) => reject(err));
          request.on('timeout', () => {
            request.destroy();
            reject(new Error('Timeout'));
          });
          request.end();
        } catch (e) {
          reject(e);
        }
      });
    };

    const findRateInJSON = (obj: any): number | null => {
      if (typeof obj === 'number') {
        if (obj > 10 && obj < 5000) return obj;
      }
      if (typeof obj === 'string') {
        const val = parseFloat(obj.replace(',', '.'));
        if (!isNaN(val) && val > 10 && val < 5000) return val;
      }
      if (obj && typeof obj === 'object') {
        const priorityKeys = ['price', 'promedio', 'valor', 'rate', 'bcv', 'compra', 'venta', 'usd', 'dolartoday'];
        for (const key of priorityKeys) {
          if (key in obj) {
            const val = findRateInJSON(obj[key]);
            if (val !== null) return val;
          }
        }
        for (const key of Object.keys(obj)) {
          if (!priorityKeys.includes(key)) {
            const val = findRateInJSON(obj[key]);
            if (val !== null) return val;
          }
        }
      }
      return null;
    };

    const userApiKey = process.env.DOLARVZLA_API_KEY || "bb97236f5cae9940516fb1dab5c9e486d97a0477684c49cdb340475c71137792";

    const endpoints = [
      {
        url: "https://api.dolarvzla.com/public/bcv/exchange-rate",
        headers: { "x-dolarvzla-key": userApiKey },
        parse: (raw: string) => {
          try {
            const data = JSON.parse(raw);
            if (data && data.current && typeof data.current.usd === 'number') {
              return data.current.usd;
            }
            return findRateInJSON(data);
          } catch {
            return null;
          }
        }
      },
      {
        url: "https://rates.dolarvzla.com/bcv/current.json",
        parse: (raw: string) => {
          try {
            const data = JSON.parse(raw);
            if (data && data.current && typeof data.current.usd === 'number') {
              return data.current.usd;
            }
            return findRateInJSON(data);
          } catch {
            return null;
          }
        }
      },
      {
        url: "https://ve.dolarapi.com/v1/dolares/bcv",
        parse: (raw: string) => {
          const data = JSON.parse(raw);
          if (data) {
            const val = data.promedio || data.compra || data.venta || data.valor;
            if (typeof val === 'number') return val;
            if (typeof val === 'string') {
              const parsed = parseFloat(val);
              if (!isNaN(parsed) && parsed > 0) return parsed;
            }
          }
          return null;
        }
      },
      {
        url: "https://ve.dolarapi.com/v1/dolares/oficial",
        parse: (raw: string) => {
          const data = JSON.parse(raw);
          if (data) {
            const val = data.promedio || data.compra || data.venta || data.valor;
            if (typeof val === 'number') return val;
            if (typeof val === 'string') {
              const parsed = parseFloat(val);
              if (!isNaN(parsed) && parsed > 0) return parsed;
            }
          }
          return null;
        }
      },
      {
        url: "https://bcv-api.vercel.app/api/bcv",
        parse: (raw: string) => {
          const data = JSON.parse(raw);
          if (data && typeof data.bcv === 'number') return data.bcv;
          if (data && typeof data.bcv === 'string') {
            const parsed = parseFloat(data.bcv);
            if (!isNaN(parsed) && parsed > 0) return parsed;
          }
          return null;
        }
      },
      {
        url: "https://pydolarve.org/api/v1/dollar?page=bcv",
        parse: (raw: string) => {
          const data = JSON.parse(raw);
          if (data && data.monitors && data.monitors.bcv && typeof data.monitors.bcv.price === 'number') {
            return data.monitors.bcv.price;
          }
          return null;
        }
      },
      {
        url: "https://www.bcv.org.ve/",
        parse: (raw: string) => {
          const m1 = raw.match(/id=["']dolar["'][\s\S]*?<strong[^>]*?>\s*([0-9.,]+)\s*<\/strong>/i);
          if (m1 && m1[1]) {
            const parsedVal = parseFloat(m1[1].replace(',', '.').trim());
            if (!isNaN(parsedVal) && parsedVal > 0) return parsedVal;
          }
          const m2 = raw.match(/id=["']dolar["'][\s\S]*?>\s*([0-9]+[,.][0-9]+)\s*</i);
          if (m2 && m2[1]) {
            const parsedVal = parseFloat(m2[1].replace(',', '.').trim());
            if (!isNaN(parsedVal) && parsedVal > 0) return parsedVal;
          }
          const m3 = raw.match(/USD[\s\S]*?<strong[^>]*?>\s*([0-9.,]+)\s*<\/strong>/i);
          if (m3 && m3[1]) {
            const parsedVal = parseFloat(m3[1].replace(',', '.').trim());
            if (!isNaN(parsedVal) && parsedVal > 0) return parsedVal;
          }
          return null;
        }
      }
    ];

    for (const ep of endpoints) {
      try {
        const rawBody = await fetchBypassTLS(ep.url, (ep as any).headers || {});
        const rate = ep.parse(rawBody);
        if (rate && rate > 0) {
          console.log(`[BCV Rate] Clean fetch success from ${new URL(ep.url).hostname}: ${rate}`);
          return res.json({ rate });
        }
      } catch (err: any) {
        // Log a clean single information line instead of throwing verbose stack traces in the server stream
        console.log(`[BCV Rate] Info: Could not get rate from ${new URL(ep.url).hostname} (${err.message || 'Connection offline'})`);
      }
    }

    // Default real-world rate fallback
    console.log(`[BCV Rate] Using default fallback: 530.50`);
    res.json({ rate: 530.50, isFallback: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
