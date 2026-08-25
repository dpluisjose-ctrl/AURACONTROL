/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AppUser } from './types';
import LoginPortal from './components/LoginPortal';
import Icon from './components/Icon';
import { WalletApp } from './components/WalletApp';
import { saveUserToFirestore } from './sync';
import { db } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc,
  query,
  orderBy 
} from 'firebase/firestore';

interface AssistantTask {
  id: string;
  text: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  category: 'personal' | 'trabajo' | 'finanzas' | 'salud';
  dueDate?: string;
}

interface AssistantNote {
  id: string;
  title: string;
  content: string;
  date: string;
  color: string;
}

interface AssistantHabit {
  id: string;
  name: string;
  streak: number;
  history: Record<string, boolean>; // date string (YYYY-MM-DD) -> completed status
  reminderTime?: string; // "HH:MM" format
  reminderActive?: boolean;
}

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export default function App() {
  // -------------------------------------------------------------
  // SESSION STATE
  // -------------------------------------------------------------
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try {
      const local = localStorage.getItem('wallet_logged_in_user');
      return local ? JSON.parse(local) : null;
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState<'asistente' | 'tareas' | 'notas' | 'habitos'>('asistente');
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);

  // -------------------------------------------------------------
  // ASSISTANT APPLICATION STATE
  // -------------------------------------------------------------
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  const [tasks, setTasks] = useState<AssistantTask[]>([]);
  const [taskInput, setTaskInput] = useState('');
  const [taskPriority, setTaskPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [taskCategory, setTaskCategory] = useState<'personal' | 'trabajo' | 'finanzas' | 'salud'>('personal');
  const [taskDueDate, setTaskDueDate] = useState('');

  const [notes, setNotes] = useState<AssistantNote[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteColor, setNoteColor] = useState('indigo');
  const [noteSearchQuery, setNoteSearchQuery] = useState('');
  const [isEditingNoteId, setIsEditingNoteId] = useState<string | null>(null);

  const [habits, setHabits] = useState<AssistantHabit[]>([]);
  const [habitInput, setHabitInput] = useState('');
  const [habitReminderEnabled, setHabitReminderEnabled] = useState(false);
  const [habitReminderTime, setHabitReminderTime] = useState('09:00');

  const [activeReminderEditId, setActiveReminderEditId] = useState<string | null>(null);
  const [editReminderTime, setEditReminderTime] = useState('09:00');

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    return typeof Notification !== 'undefined' ? Notification.permission : 'default';
  });

  const [notifiedHabits, setNotifiedHabits] = useState<Record<string, string>>(() => {
    try {
      const local = localStorage.getItem('assistant_notified_habits');
      return local ? JSON.parse(local) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('assistant_notified_habits', JSON.stringify(notifiedHabits));
  }, [notifiedHabits]);

  // Helper to convert base64 VAPID public key to Uint8Array
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  // Subscribe current browser / mobile user to background Push Notification alerts
  const subscribeUserToPush = async () => {
    if (!currentUser) return;
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        // Register sw.js static asset
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[Push Client] Service Worker registered:', registration.scope);

        // Retrieve public VAPID key from Node server
        const response = await fetch('/api/push/public-key');
        const { publicKey } = await response.json();
        
        if (!publicKey) {
          console.warn("[Push Client] No public VAPID key received.");
          return;
        }

        const subscribeOptions = {
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        };

        // Subscription check & registration
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe(subscribeOptions);
        }

        // Post push sub + local timezone to server
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: currentUser.id,
            subscription,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          })
        });

        console.log('[Push Client] Push subscription synced with background server.');
      } catch (err) {
        console.error('[Push Client] Failed to register background push sub:', err);
      }
    }
  };

  // Request Notification Permission with user gesture compatibility (iOS Safari)
  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') {
      alert('Las notificaciones no son compatibles con este navegador o dispositivo.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        // Run full background Service Worker Push subscription registration flow
        await subscribeUserToPush();
        
        new Notification('¡Aura Asistente!', {
          body: 'Los recordatorios de tus hábitos se han activado correctamente para cuando la app esté cerrada. ✨',
          icon: '/favicon.ico'
        });
      }
    } catch (e) {
      console.error("Error requesting notifications permission:", e);
    }
  };

  // Auto-subscribe/refresh background token whenever the user is logged in
  useEffect(() => {
    if (currentUser && notificationPermission === 'granted') {
      subscribeUserToPush();
    }
  }, [currentUser, notificationPermission]);

  // Background check for habit reminders
  useEffect(() => {
    if (!currentUser) return;

    const checkReminders = () => {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const currentHHMM = now.toTimeString().slice(0, 5); // "HH:MM" format

      habits.forEach(habit => {
        if (habit.reminderActive && habit.reminderTime === currentHHMM) {
          const isCompletedToday = habit.history[todayStr] || false;
          if (!isCompletedToday) {
            const lastNotified = notifiedHabits[habit.id];
            if (lastNotified !== todayStr) {
              // Trigger standard Web Notification
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification('Recordatorio de Hábito', {
                  body: `¡Hola, ${currentUser.username}! Es momento de realizar tu hábito de hoy: ${habit.name}. ✨`,
                  icon: '/favicon.ico',
                  tag: `habit-${habit.id}`,
                  requireInteraction: true
                });
              } else {
                console.log(`Notification trigger for ${habit.name} - permission is: ${Notification ? Notification.permission : 'not supported'}`);
              }
              setNotifiedHabits(prev => ({ ...prev, [habit.id]: todayStr }));
            }
          }
        }
      });
    };

    // Run every 10 seconds
    const intervalId = setInterval(checkReminders, 10000);
    return () => clearInterval(intervalId);
  }, [habits, notifiedHabits, currentUser]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------
  // PERSISTENCE: INITIAL LOADING FROM FIRESTORE OR LOCAL STORAGE
  // -------------------------------------------------------------
  useEffect(() => {
    if (!currentUser) return;

    // Load initial data from local storage
    try {
      const storedTasks = localStorage.getItem(`assistant_tasks_${currentUser.id}`);
      if (storedTasks) setTasks(JSON.parse(storedTasks));
      
      const storedNotes = localStorage.getItem(`assistant_notes_${currentUser.id}`);
      if (storedNotes) setNotes(JSON.parse(storedNotes));

      const storedHabits = localStorage.getItem(`assistant_habits_${currentUser.id}`);
      if (storedHabits) setHabits(JSON.parse(storedHabits));

      const storedChat = localStorage.getItem(`assistant_chat_${currentUser.id}`);
      if (storedChat) {
        setChatMessages(JSON.parse(storedChat));
      } else {
        // Welcoming assistant message
        setChatMessages([
          {
            role: 'model',
            parts: [{ text: `¡Hola, ${currentUser.username}! Soy Aura, tu asistente personal. ¿En qué te puedo apoyar hoy? Puedo ayudarte a organizar tus pendientes, darte consejos financieros basados en la tasa de cambio o planificar tus hábitos.` }]
          }
        ]);
      }
    } catch (e) {
      console.error("Local storage restoration error:", e);
    }

    // Load data from Firestore asynchronously for synchronization
    const syncFirestoreData = async () => {
      try {
        // 1. Fetch Tasks
        const tasksCol = collection(db, 'users', currentUser.id, 'tasks');
        const tasksSnap = await getDocs(tasksCol);
        const fbTasks: AssistantTask[] = [];
        tasksSnap.forEach(doc => fbTasks.push({ id: doc.id, ...doc.data() } as AssistantTask));
        if (fbTasks.length > 0) {
          setTasks(fbTasks);
          localStorage.setItem(`assistant_tasks_${currentUser.id}`, JSON.stringify(fbTasks));
        }

        // 2. Fetch Notes
        const notesCol = collection(db, 'users', currentUser.id, 'notes');
        const notesSnap = await getDocs(notesCol);
        const fbNotes: AssistantNote[] = [];
        notesSnap.forEach(doc => fbNotes.push({ id: doc.id, ...doc.data() } as AssistantNote));
        if (fbNotes.length > 0) {
          setNotes(fbNotes);
          localStorage.setItem(`assistant_notes_${currentUser.id}`, JSON.stringify(fbNotes));
        }

        // 3. Fetch Habits
        const habitsCol = collection(db, 'users', currentUser.id, 'habits');
        const habitsSnap = await getDocs(habitsCol);
        const fbHabits: AssistantHabit[] = [];
        habitsSnap.forEach(doc => fbHabits.push({ id: doc.id, ...doc.data() } as AssistantHabit));
        if (fbHabits.length > 0) {
          setHabits(fbHabits);
          localStorage.setItem(`assistant_habits_${currentUser.id}`, JSON.stringify(fbHabits));
        }

        // 4. Fetch Chat
        const chatCol = collection(db, 'users', currentUser.id, 'chat');
        const chatSnap = await getDocs(query(chatCol, orderBy('timestamp', 'asc')));
        const fbChat: ChatMessage[] = [];
        chatSnap.forEach(doc => {
          const d = doc.data();
          fbChat.push({ role: d.role, parts: [{ text: d.text }] });
        });
        if (fbChat.length > 0) {
          setChatMessages(fbChat);
          localStorage.setItem(`assistant_chat_${currentUser.id}`, JSON.stringify(fbChat));
        }
      } catch (err) {
        console.warn("Firestore syncing skipped (offline or initial connection setup):", err);
      }
    };

    syncFirestoreData();
  }, [currentUser]);

  // Scroll to chat bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // -------------------------------------------------------------
  // SYNC WRITES TO LOCAL STORAGE + FIRESTORE
  // -------------------------------------------------------------
  const persistTasks = async (updatedTasks: AssistantTask[]) => {
    if (!currentUser) return;
    setTasks(updatedTasks);
    localStorage.setItem(`assistant_tasks_${currentUser.id}`, JSON.stringify(updatedTasks));
    
    // Fire-and-forget sync to Firestore
    try {
      const colRef = collection(db, 'users', currentUser.id, 'tasks');
      // For simplicity and alignment, we set each item individually
      for (const t of updatedTasks) {
        await setDoc(doc(colRef, t.id), t);
      }
    } catch (e) {
      console.warn("Firestore task sync deferred:", e);
    }
  };

  const persistNotes = async (updatedNotes: AssistantNote[]) => {
    if (!currentUser) return;
    setNotes(updatedNotes);
    localStorage.setItem(`assistant_notes_${currentUser.id}`, JSON.stringify(updatedNotes));

    try {
      const colRef = collection(db, 'users', currentUser.id, 'notes');
      for (const n of updatedNotes) {
        await setDoc(doc(colRef, n.id), n);
      }
    } catch (e) {
      console.warn("Firestore note sync deferred:", e);
    }
  };

  const persistHabits = async (updatedHabits: AssistantHabit[]) => {
    if (!currentUser) return;
    setHabits(updatedHabits);
    localStorage.setItem(`assistant_habits_${currentUser.id}`, JSON.stringify(updatedHabits));

    try {
      const colRef = collection(db, 'users', currentUser.id, 'habits');
      for (const h of updatedHabits) {
        await setDoc(doc(colRef, h.id), h);
      }
    } catch (e) {
      console.warn("Firestore habit sync deferred:", e);
    }
  };

  const persistChatHistory = async (updatedChat: ChatMessage[]) => {
    if (!currentUser) return;
    setChatMessages(updatedChat);
    localStorage.setItem(`assistant_chat_${currentUser.id}`, JSON.stringify(updatedChat));

    try {
      const colRef = collection(db, 'users', currentUser.id, 'chat');
      const latestMsg = updatedChat[updatedChat.length - 1];
      if (latestMsg) {
        const msgId = `msg-${Date.now()}`;
        await setDoc(doc(colRef, msgId), {
          role: latestMsg.role,
          text: latestMsg.parts[0].text,
          timestamp: Date.now()
        });
      }
    } catch (e) {
      console.warn("Firestore chat sync deferred:", e);
    }
  };

  // -------------------------------------------------------------
  // ACTIONS HANDLERS
  // -------------------------------------------------------------
  const handleLoginSuccess = (user: AppUser) => {
    localStorage.setItem('wallet_logged_in_user', JSON.stringify(user));
    setCurrentUser(user);
    setActiveTab('asistente');
  };

  const handleLogout = () => {
    localStorage.removeItem('wallet_logged_in_user');
    setCurrentUser(null);
  };

  const handleUpdateAvatar = async (newAvatar: string) => {
    if (!currentUser) return;
    const updatedUser = { ...currentUser, avatar: newAvatar };
    setCurrentUser(updatedUser);
    localStorage.setItem('wallet_logged_in_user', JSON.stringify(updatedUser));
    try {
      await saveUserToFirestore(updatedUser);
    } catch (e) {
      console.error("Failed to update avatar in Firestore:", e);
    }
  };

  // Chat handling
  const handleSendChat = async (overridePrompt?: string) => {
    const promptToSend = overridePrompt || chatInput;
    if (!promptToSend.trim() || isChatLoading || !currentUser) return;

    const userMsg: ChatMessage = {
      role: 'user',
      parts: [{ text: promptToSend }]
    };

    const newHistory = [...chatMessages, userMsg];
    persistChatHistory(newHistory);
    setChatInput('');
    setIsChatLoading(true);

    try {
      // Keep only last 10 messages for prompt efficiency and rate-limiting
      const trimmedHistory = newHistory.slice(-10);

      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: trimmedHistory })
      });

      if (!response.ok) throw new Error("Network request failed");
      const data = await response.json();
      
      const modelMsg: ChatMessage = {
        role: 'model',
        parts: [{ text: data.text || "Disculpa, no logré procesar tu solicitud." }]
      };
      
      persistChatHistory([...newHistory, modelMsg]);
    } catch (err) {
      console.error(err);
      const errorMsg: ChatMessage = {
        role: 'model',
        parts: [{ text: "Ocurrió un error al contactar al servidor. Por favor, intenta de nuevo." }]
      };
      persistChatHistory([...newHistory, errorMsg]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Tasks handling
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskInput.trim()) return;

    const newTask: AssistantTask = {
      id: 'task-' + Date.now(),
      text: taskInput.trim(),
      completed: false,
      priority: taskPriority,
      category: taskCategory,
      dueDate: taskDueDate || undefined
    };

    persistTasks([...tasks, newTask]);
    setTaskInput('');
    setTaskDueDate('');
  };

  const handleToggleTask = (id: string) => {
    const updated = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    persistTasks(updated);
  };

  const handleDeleteTask = async (id: string) => {
    const updated = tasks.filter(t => t.id !== id);
    persistTasks(updated);

    if (currentUser) {
      try {
        await deleteDoc(doc(db, 'users', currentUser.id, 'tasks', id));
      } catch (e) {
        console.warn("Firestore delete deferred:", e);
      }
    }
  };

  // Notes handling
  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) return;

    if (isEditingNoteId) {
      const updated = notes.map(n => n.id === isEditingNoteId ? {
        ...n,
        title: noteTitle.trim(),
        content: noteContent.trim(),
        color: noteColor,
        date: new Date().toLocaleDateString()
      } : n);
      persistNotes(updated);
      setIsEditingNoteId(null);
    } else {
      const newNote: AssistantNote = {
        id: 'note-' + Date.now(),
        title: noteTitle.trim(),
        content: noteContent.trim(),
        date: new Date().toLocaleDateString(),
        color: noteColor
      };
      persistNotes([...notes, newNote]);
    }

    setNoteTitle('');
    setNoteContent('');
  };

  const handleEditNoteStart = (note: AssistantNote) => {
    setIsEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNoteColor(note.color);
  };

  const handleDeleteNote = async (id: string) => {
    const updated = notes.filter(n => n.id !== id);
    persistNotes(updated);
    if (isEditingNoteId === id) {
      setIsEditingNoteId(null);
      setNoteTitle('');
      setNoteContent('');
    }

    if (currentUser) {
      try {
        await deleteDoc(doc(db, 'users', currentUser.id, 'notes', id));
      } catch (e) {
        console.warn("Firestore delete deferred:", e);
      }
    }
  };

  // Habits handling
  const handleAddHabit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!habitInput.trim()) return;

    const newHabit: AssistantHabit = {
      id: 'habit-' + Date.now(),
      name: habitInput.trim(),
      streak: 0,
      history: {},
      reminderTime: habitReminderEnabled ? habitReminderTime : undefined,
      reminderActive: habitReminderEnabled
    };

    persistHabits([...habits, newHabit]);
    setHabitInput('');
    setHabitReminderEnabled(false);
  };

  const handleSaveInlineReminder = (habitId: string, timeStr: string) => {
    const updated = habits.map(h => {
      if (h.id !== habitId) return h;
      return {
        ...h,
        reminderTime: timeStr,
        reminderActive: true
      };
    });
    persistHabits(updated);
    setActiveReminderEditId(null);
  };

  const handleDisableInlineReminder = (habitId: string) => {
    const updated = habits.map(h => {
      if (h.id !== habitId) return h;
      return {
        ...h,
        reminderActive: false
      };
    });
    persistHabits(updated);
    setActiveReminderEditId(null);
  };

  const handleToggleHabit = (habitId: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const updated = habits.map(h => {
      if (h.id !== habitId) return h;

      const isCompleted = h.history[todayStr];
      const nextHistory = { ...h.history, [todayStr]: !isCompleted };

      // Simple streak recalculation
      let streak = 0;
      const dates = Object.keys(nextHistory).sort((a, b) => b.localeCompare(a));
      
      let checkDate = new Date();
      let active = true;

      while (active) {
        const checkStr = checkDate.toISOString().split('T')[0];
        if (nextHistory[checkStr]) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          // If the day is today and it's not checked, we can look at yesterday to maintain active streak
          const todayCheckStr = new Date().toISOString().split('T')[0];
          if (checkStr === todayCheckStr) {
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            active = false;
          }
        }
      }

      return {
        ...h,
        streak,
        history: nextHistory
      };
    });

    persistHabits(updated);
  };

  const handleDeleteHabit = async (id: string) => {
    const updated = habits.filter(h => h.id !== id);
    persistHabits(updated);

    if (currentUser) {
      try {
        await deleteDoc(doc(db, 'users', currentUser.id, 'habits', id));
      } catch (e) {
        console.warn("Firestore delete deferred:", e);
      }
    }
  };

  // -------------------------------------------------------------
  // DYNAMIC WELCOME MESSAGE BASED ON TIME OF DAY
  // -------------------------------------------------------------
  const welcomeGreeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  }, []);

  // Filtered lists
  const filteredNotes = useMemo(() => {
    if (!noteSearchQuery.trim()) return notes;
    const query = noteSearchQuery.toLowerCase();
    return notes.filter(n => n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query));
  }, [notes, noteSearchQuery]);

  const taskProgress = useMemo(() => {
    if (tasks.length === 0) return 0;
    const completed = tasks.filter(t => t.completed).length;
    return Math.round((completed / tasks.length) * 100);
  }, [tasks]);

  if (!currentUser) {
    return <LoginPortal onLoginSuccess={handleLoginSuccess} />;
  }

  // -------------------------------------------------------------
  // RENDER INTERACTIVE WALLET OVERLAY
  // -------------------------------------------------------------
  if (isWalletOpen) {
    return (
      <WalletApp 
        currentUser={currentUser}
        onLogout={handleLogout}
        onUpdateAvatar={handleUpdateAvatar}
        onClose={() => setIsWalletOpen(false)}
      />
    );
  }

  return (
    <div className="flex-1 flex md:flex-row flex-col h-full bg-slate-950 text-slate-100 font-sans overflow-hidden">
      
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-900 bg-slate-950 px-5 pt-6 pb-4 justify-between select-none shrink-0 h-full">
        <div className="flex flex-col gap-6">
          {/* Logo Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Icon name="sparkles" className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-black text-sm tracking-tight text-white leading-none">Aura Asistente</h1>
              <span className="text-[9px] text-slate-500 font-black tracking-tight block mt-1 uppercase">Tu espacio personal</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex flex-col gap-1">
            <button 
              type="button"
              onClick={() => setActiveTab('asistente')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs focus:outline-none ${activeTab === 'asistente' ? 'bg-indigo-600/10 text-indigo-400 font-black' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'}`}
            >
              <Icon name="message-square" className="w-4 h-4" />
              <span>Conversar Aura</span>
            </button>
            <button 
              type="button"
              onClick={() => setActiveTab('tareas')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs focus:outline-none ${activeTab === 'tareas' ? 'bg-indigo-600/10 text-indigo-400 font-black' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'}`}
            >
              <Icon name="check-square" className="w-4 h-4" />
              <span>Tareas Pendientes</span>
              {tasks.filter(t => !t.completed).length > 0 && (
                <span className="ml-auto bg-indigo-600/20 text-indigo-400 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {tasks.filter(t => !t.completed).length}
                </span>
              )}
            </button>
            <button 
              type="button"
              onClick={() => setActiveTab('notas')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs focus:outline-none ${activeTab === 'notas' ? 'bg-indigo-600/10 text-indigo-400 font-black' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'}`}
            >
              <Icon name="file-text" className="w-4 h-4" />
              <span>Notas & Ideas</span>
            </button>
            <button 
              type="button"
              onClick={() => setActiveTab('habitos')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs focus:outline-none ${activeTab === 'habitos' ? 'bg-indigo-600/10 text-indigo-400 font-black' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'}`}
            >
              <Icon name="activity" className="w-4 h-4" />
              <span>Mis Hábitos</span>
            </button>
          </div>
        </div>

        {/* BOTTOM QUICK BUTTONS AND PROFILE */}
        <div className="flex flex-col gap-2 pt-4 border-t border-slate-900">
          {/* COMPLEMENTARY VIRTUAL WALLET TRIGGER */}
          <button
            type="button"
            onClick={() => setIsWalletOpen(true)}
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl bg-gradient-to-r from-emerald-650 to-teal-650 hover:from-emerald-700 hover:to-teal-700 text-white transition-all font-bold text-xs shadow-lg shadow-emerald-900/20 focus:outline-none cursor-pointer"
          >
            <Icon name="wallet" className="w-4 h-4" />
            <span>Billetera Virtual</span>
            <Icon name="chevron-right" className="w-3.5 h-3.5 ml-auto animate-pulse" />
          </button>

          <button 
            type="button"
            onClick={() => setIsProfileSettingsOpen(!isProfileSettingsOpen)}
            className="w-full flex items-center justify-between p-2.5 bg-slate-900 border border-slate-850 hover:bg-slate-850 rounded-xl transition-all focus:outline-none cursor-pointer text-left"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xl shrink-0">{currentUser.avatar}</span>
              <div className="min-w-0 flex flex-col">
                <span className="text-xs font-black text-white truncate leading-tight">{currentUser.username}</span>
                <span className="text-[8px] text-slate-500 font-bold uppercase truncate tracking-tight mt-0.5">{currentUser.email}</span>
              </div>
            </div>
            <Icon name="settings" className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </aside>

      {/* MOBILE HEADER */}
      <header className="md:hidden px-4 py-3 flex justify-between items-center border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <Icon name="sparkles" className="w-5 h-5 text-indigo-400" />
          <h1 className="font-display font-black text-sm tracking-tight text-white uppercase">Aura</h1>
        </div>
        <button
          type="button"
          onClick={() => setIsWalletOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-[10px] font-black focus:outline-none cursor-pointer"
        >
          <Icon name="wallet" className="w-3.5 h-3.5" />
          <span>Billetera</span>
        </button>
      </header>

      {/* MAIN WORKSPACE CANVAS */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-slate-950">
        
        {/* SUB HEADER TAB TITLE */}
        <div className="px-6 py-4 flex justify-between items-center border-b border-slate-900 select-none">
          <div>
            <h2 className="font-display font-black text-base text-white tracking-tight">
              {activeTab === 'asistente' && `Asistente Inteligente`}
              {activeTab === 'tareas' && 'Gestor de Tareas'}
              {activeTab === 'notas' && 'Notas & Ideas'}
              {activeTab === 'habitos' && 'Registro de Hábitos'}
            </h2>
            <p className="text-[10px] text-slate-500 font-bold mt-0.5">
              {activeTab === 'asistente' && 'Conversa con tu asesor personal'}
              {activeTab === 'tareas' && `${tasks.filter(t => !t.completed).length} pendientes restantes`}
              {activeTab === 'notas' && `${notes.length} notas creadas`}
              {activeTab === 'habitos' && `${habits.length} hábitos en seguimiento`}
            </p>
          </div>
        </div>

        {/* WORKSPACE CONTENT AREA */}
        <main className="flex-1 overflow-y-auto custom-scroll p-6 pb-24 h-full">
          
          {/* TAB 1: AI ASSISTANT CHAT */}
          {activeTab === 'asistente' && (
            <div className="flex flex-col h-full max-w-3xl mx-auto gap-4">
              {/* CHAT BUBBLES LIST */}
              <div className="flex-1 min-h-[350px] bg-slate-900/30 border border-slate-900 rounded-3xl p-4 overflow-y-auto custom-scroll flex flex-col gap-4">
                {chatMessages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`flex gap-3.5 max-w-[85%] ${msg.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border text-sm ${msg.role === 'user' ? 'bg-indigo-600/10 border-indigo-500/20 text-indigo-400' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
                      {msg.role === 'user' ? currentUser.avatar : '✨'}
                    </div>
                    <div className={`p-3.5 rounded-2xl text-xs leading-relaxed ${msg.role === 'user' ? 'bg-indigo-650 text-white rounded-tr-none' : 'bg-slate-900 border border-slate-850 text-slate-200 rounded-tl-none'}`}>
                      <p className="whitespace-pre-line">{msg.parts[0].text}</p>
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="self-start flex gap-3.5 max-w-[80%]">
                    <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-sm">
                      ✨
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-850 rounded-tl-none text-slate-500 text-xs flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* QUICK SUGGESTIONS CHIPS */}
              <div className="flex gap-2 overflow-x-auto custom-scroll pb-1">
                {[
                  '¿Cómo puedo organizar mis finanzas?',
                  'Dame un tip de productividad hoy',
                  'Ayúdame a planificar una rutina diaria',
                  '¿Cómo configuro deudas de forma sana?'
                ].map((chip, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSendChat(chip)}
                    className="whitespace-nowrap px-3.5 py-2 rounded-full border border-slate-850 bg-slate-900 text-[10px] font-bold text-slate-400 hover:text-white hover:border-slate-750 transition-all cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* PROMPT BOX INPUT */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder="Pregúntale a Aura..."
                  className="flex-1 bg-slate-900 border border-slate-850 px-4 py-3 rounded-2xl text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => handleSendChat()}
                  disabled={!chatInput.trim() || isChatLoading}
                  className="px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl flex items-center justify-center transition-all cursor-pointer"
                >
                  <Icon name="send" className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: TASKS / TO-DO MANAGER */}
          {activeTab === 'tareas' && (
            <div className="max-w-3xl mx-auto flex flex-col gap-6">
              {/* PROGRESS BAR WIDGET */}
              <div className="bg-slate-900 border border-slate-850 p-5 rounded-3xl">
                <div className="flex justify-between items-center text-xs font-bold text-slate-400 mb-2">
                  <span>Progreso de Tareas Diarias</span>
                  <span className="text-indigo-400 font-black">{taskProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all duration-500"
                    style={{ width: `${taskProgress}%` }}
                  />
                </div>
              </div>

              {/* ADD TASK FORM */}
              <form onSubmit={handleAddTask} className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-900/50 border border-slate-900 p-4 rounded-3xl">
                <div className="md:col-span-2">
                  <input
                    type="text"
                    value={taskInput}
                    onChange={(e) => setTaskInput(e.target.value)}
                    placeholder="Escribe un pendiente..."
                    className="w-full bg-slate-950 border border-slate-850 px-3.5 py-2.5 rounded-xl text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>
                <div>
                  <select
                    value={taskPriority}
                    onChange={(e: any) => setTaskPriority(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2.5 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="high">Alta Prioridad</option>
                    <option value="medium">Media Prioridad</option>
                    <option value="low">Baja Prioridad</option>
                  </select>
                </div>
                <div>
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-650/10 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Icon name="plus" className="w-4 h-4" />
                    <span>Agregar</span>
                  </button>
                </div>
                
                {/* Advanced task settings */}
                <div className="grid grid-cols-2 gap-2 md:col-span-2">
                  <select
                    value={taskCategory}
                    onChange={(e: any) => setTaskCategory(e.target.value)}
                    className="w-full bg-slate-955 border border-slate-850 px-3 py-2 rounded-xl text-[11px] text-slate-400 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="personal">Personal</option>
                    <option value="trabajo">Trabajo</option>
                    <option value="finanzas">Finanzas</option>
                    <option value="salud">Salud</option>
                  </select>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full bg-slate-955 border border-slate-850 px-3 py-2 rounded-xl text-[11px] text-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </form>

              {/* TASKS LIST */}
              <div className="flex flex-col gap-2.5">
                {tasks.length === 0 ? (
                  <div className="text-center py-12 bg-slate-900/20 border border-slate-900 border-dashed rounded-3xl">
                    <Icon name="check-square" className="w-8 h-8 text-slate-650 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 font-bold">No tienes tareas hoy.</p>
                  </div>
                ) : (
                  tasks.map(task => (
                    <div 
                      key={task.id}
                      className={`flex items-center justify-between p-4 bg-slate-900 border rounded-2xl transition-all ${task.completed ? 'border-slate-900 opacity-60' : 'border-slate-850 hover:border-slate-750'}`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleToggleTask(task.id)}
                          className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${task.completed ? 'bg-indigo-655 border-indigo-500 text-white' : 'border-slate-700 hover:border-indigo-500 text-transparent'}`}
                        >
                          <Icon name="check" className="w-3.5 h-3.5" />
                        </button>
                        <div className="min-w-0 flex flex-col">
                          <span className={`text-xs font-medium text-slate-100 ${task.completed ? 'line-through text-slate-500' : ''}`}>
                            {task.text}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md tracking-wider ${
                              task.priority === 'high' ? 'bg-rose-950/40 text-rose-400 border border-rose-900/30' : 
                              task.priority === 'medium' ? 'bg-amber-950/40 text-amber-400 border border-amber-900/30' :
                              'bg-slate-800 text-slate-450 border border-slate-750'
                            }`}>
                              {task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Media' : 'Baja'}
                            </span>
                            <span className="text-[9px] text-slate-500 font-mono font-bold capitalize">
                              {task.category}
                            </span>
                            {task.dueDate && (
                              <span className="text-[9px] text-indigo-400 font-mono font-bold flex items-center gap-1">
                                <Icon name="calendar" className="w-3 h-3" />
                                {task.dueDate}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1 text-slate-550 hover:text-rose-400 hover:bg-slate-850 rounded-lg transition-all focus:outline-none"
                      >
                        <Icon name="trash-2" className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: NOTES & IDEAS */}
          {activeTab === 'notas' && (
            <div className="max-w-4xl mx-auto flex flex-col gap-6">
              {/* SEARCH AND CREATION PANEL */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Search input */}
                <div className="relative md:col-span-1">
                  <input
                    type="text"
                    value={noteSearchQuery}
                    onChange={(e) => setNoteSearchQuery(e.target.value)}
                    placeholder="Buscar notas..."
                    className="w-full bg-slate-900 border border-slate-850 px-9 py-2.5 rounded-xl text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <Icon name="search" className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                </div>

                {/* Form to save new note */}
                <form onSubmit={handleSaveNote} className="md:col-span-2 bg-slate-900 border border-slate-850 p-4 rounded-3xl flex flex-col gap-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      placeholder="Título de la nota..."
                      className="flex-1 bg-slate-950 border border-slate-850 px-3.5 py-2 rounded-xl text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    {/* Color picker */}
                    <div className="flex items-center gap-1 bg-slate-955 px-2.5 rounded-xl border border-slate-850">
                      {['indigo', 'emerald', 'amber', 'rose', 'slate'].map(col => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => setNoteColor(col)}
                          className={`w-3.5 h-3.5 rounded-full ${
                            col === 'indigo' ? 'bg-indigo-500' :
                            col === 'emerald' ? 'bg-emerald-500' :
                            col === 'amber' ? 'bg-amber-500' :
                            col === 'rose' ? 'bg-rose-500' :
                            'bg-slate-405'
                          } ${noteColor === col ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-white scale-[1.1]' : ''}`}
                        />
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Escribe tus ideas aquí..."
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-850 p-3 rounded-xl text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    {isEditingNoteId && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingNoteId(null);
                          setNoteTitle('');
                          setNoteContent('');
                        }}
                        className="px-3.5 py-2 bg-slate-950 border border-slate-850 rounded-xl text-[11px] font-bold text-slate-400 hover:text-white"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="submit"
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-xl shadow-lg active:scale-95 transition-all"
                    >
                      {isEditingNoteId ? 'Actualizar Nota' : 'Guardar Nota'}
                    </button>
                  </div>
                </form>
              </div>

              {/* NOTES LIST */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredNotes.length === 0 ? (
                  <div className="col-span-full text-center py-12 bg-slate-900/20 border border-slate-900 border-dashed rounded-3xl">
                    <Icon name="file-text" className="w-8 h-8 text-slate-650 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 font-bold">No se encontraron notas.</p>
                  </div>
                ) : (
                  filteredNotes.map(note => (
                    <div 
                      key={note.id}
                      className={`p-4 bg-slate-900 border-l-4 rounded-2xl flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-lg transition-all ${
                        note.color === 'indigo' ? 'border-indigo-550' :
                        note.color === 'emerald' ? 'border-emerald-555' :
                        note.color === 'amber' ? 'border-amber-550' :
                        note.color === 'rose' ? 'border-rose-550' :
                        'border-slate-600'
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="font-display font-black text-xs text-white leading-tight truncate">{note.title}</h4>
                          <span className="text-[8px] font-mono font-bold text-slate-500 shrink-0">{note.date}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                      </div>

                      <div className="flex justify-end gap-1.5 mt-4 pt-3.5 border-t border-slate-850/40">
                        <button
                          type="button"
                          onClick={() => handleEditNoteStart(note)}
                          className="p-1 hover:bg-slate-850 text-slate-500 hover:text-indigo-400 rounded transition-all focus:outline-none"
                        >
                          <Icon name="edit" className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1 hover:bg-slate-850 text-slate-500 hover:text-rose-455 rounded transition-all focus:outline-none"
                        >
                          <Icon name="trash-2" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 4: HABITS TRACKER */}
          {activeTab === 'habitos' && (
            <div className="max-w-2xl mx-auto flex flex-col gap-6">
              
              {/* NOTIFICATION ENABLE WARNING / BUTTON (for iPhone / PWA) */}
              {notificationPermission !== 'granted' && (
                <div className="p-4 bg-slate-900 border border-slate-850 rounded-2xl flex flex-col gap-2.5">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-950 flex items-center justify-center shrink-0">
                      <Icon name="bell" className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Recordatorios de Hábitos</h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                        Para recibir alertas en tu iPhone u otro dispositivo, necesitas activar los permisos y asegurarte de tener la aplicación agregada a tu Pantalla de Inicio.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-850/50 mt-1">
                    <button
                      type="button"
                      onClick={requestNotificationPermission}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-xl transition-all cursor-pointer"
                    >
                      Permitir Notificaciones
                    </button>
                    <span className="text-[10px] text-slate-500 font-medium">
                      (Safari de tu iPhone → "Compartir" → "Añadir a pantalla de inicio")
                    </span>
                  </div>
                </div>
              )}

              {/* HABIT ADD TRIGGER FORM WITH REMINDER SETUP */}
              <form onSubmit={handleAddHabit} className="flex flex-col gap-3.5 bg-slate-900/50 p-4 rounded-3xl border border-slate-900">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={habitInput}
                    onChange={(e) => setHabitInput(e.target.value)}
                    placeholder="Crear un hábito diario (ej. Tomar agua, Leer)..."
                    className="flex-1 bg-slate-950 border border-slate-850 px-3.5 py-2.5 rounded-xl text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-5 bg-indigo-650 hover:bg-indigo-750 text-white font-black text-xs rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Icon name="plus" className="w-4 h-4" />
                    <span>Crear</span>
                  </button>
                </div>

                {/* Reminder toggle option */}
                <div className="flex items-center gap-4 px-3 py-2 bg-slate-950/60 rounded-xl border border-slate-850/40 text-xs text-slate-400">
                  <label className="flex items-center gap-2 cursor-pointer font-bold select-none">
                    <input
                      type="checkbox"
                      checked={habitReminderEnabled}
                      onChange={(e) => setHabitReminderEnabled(e.target.checked)}
                      className="w-4 h-4 rounded bg-slate-900 border-slate-750 text-indigo-500 focus:ring-0 cursor-pointer"
                    />
                    <Icon name="bell" className={`w-3.5 h-3.5 ${habitReminderEnabled ? 'text-indigo-400' : 'text-slate-500'}`} />
                    <span>Programar recordatorio en mi iPhone</span>
                  </label>

                  {habitReminderEnabled && (
                    <div className="flex items-center gap-1.5 animate-slide-up">
                      <span className="text-[10px] text-slate-500">a las:</span>
                      <input
                        type="time"
                        value={habitReminderTime}
                        onChange={(e) => setHabitReminderTime(e.target.value)}
                        className="bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}
                </div>
              </form>

              {/* LIST OF ACTIVE HABITS */}
              <div className="flex flex-col gap-3">
                {habits.length === 0 ? (
                  <div className="text-center py-12 bg-slate-900/20 border border-slate-900 border-dashed rounded-3xl">
                    <Icon name="activity" className="w-8 h-8 text-slate-650 mx-auto mb-2" />
                    <p className="text-xs text-slate-505 font-bold">No tienes hábitos en seguimiento.</p>
                  </div>
                ) : (
                  habits.map(habit => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    const isCompletedToday = habit.history[todayStr] || false;

                    return (
                      <div 
                        key={habit.id}
                        className="p-4 bg-slate-900 border border-slate-850 rounded-2xl flex flex-col gap-3 hover:border-slate-750 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {/* Habit checkbox clicker */}
                            <button
                              type="button"
                              onClick={() => handleToggleHabit(habit.id)}
                              className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all active:scale-90 ${
                                isCompletedToday 
                                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400' 
                                  : 'border-slate-750 hover:border-indigo-500 text-transparent'
                              }`}
                            >
                              <Icon name="activity" className="w-4.5 h-4.5" />
                            </button>

                            <div>
                              <span className={`text-xs font-bold block ${isCompletedToday ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                                {habit.name}
                              </span>
                              <div className="flex items-center gap-1.5 mt-1 text-[9px] font-black uppercase text-amber-505">
                                <span>Streak:</span>
                                <span className="font-mono text-xs">{habit.streak} días</span>
                                <Icon name="zap" className="w-3 h-3 text-amber-450 animate-pulse" />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-black px-2 py-1 rounded-full ${isCompletedToday ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-850 text-slate-505'}`}>
                              {isCompletedToday ? 'Hecho hoy' : 'Pendiente'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteHabit(habit.id)}
                              className="p-1 hover:bg-slate-850 text-slate-550 hover:text-rose-455 rounded-lg transition-all focus:outline-none"
                            >
                              <Icon name="trash-2" className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* REMINDER SETTINGS ZONE FOR HABIT */}
                        <div className="pt-2 border-t border-slate-850/40 flex flex-col gap-2">
                          {activeReminderEditId === habit.id ? (
                            <div className="flex items-center gap-2 bg-slate-950/40 p-2 rounded-xl border border-slate-850/30 animate-slide-up">
                              <span className="text-[10px] text-slate-400">Recordar a las:</span>
                              <input
                                type="time"
                                value={editReminderTime}
                                onChange={(e) => setEditReminderTime(e.target.value)}
                                className="bg-slate-900 border border-slate-800 px-2 py-1 rounded text-xs text-slate-200"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveInlineReminder(habit.id, editReminderTime)}
                                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg cursor-pointer"
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDisableInlineReminder(habit.id)}
                                className="px-2.5 py-1 bg-slate-850 hover:bg-rose-950 hover:text-rose-400 text-[10px] font-bold text-slate-400 rounded-lg cursor-pointer"
                              >
                                Desactivar
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveReminderEditId(null)}
                                className="px-2 py-1 bg-slate-850 text-slate-500 rounded-lg hover:text-white"
                              >
                                <Icon name="x" className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveReminderEditId(habit.id);
                                  setEditReminderTime(habit.reminderTime || '09:00');
                                }}
                                className={`flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full border cursor-pointer transition-all ${
                                  habit.reminderActive 
                                    ? 'bg-indigo-950/40 border-indigo-500/30 text-indigo-400' 
                                    : 'bg-slate-950/20 border-slate-850 text-slate-500 hover:text-indigo-400 hover:border-slate-800'
                                }`}
                              >
                                <Icon name="bell" className={`w-3 h-3 ${habit.reminderActive ? 'text-indigo-400' : 'text-slate-550'}`} />
                                <span>{habit.reminderActive ? `Recordatorio: ${habit.reminderTime}` : 'Configurar Alerta iPhone'}</span>
                              </button>

                              {habit.reminderActive && !isCompletedToday && (
                                <span className="text-[9px] text-indigo-450/80 font-medium">
                                  Notificación programada
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="absolute bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-lg border-t border-slate-850/80 px-4 pt-3 pb-2.5 safe-padding-bottom flex justify-between items-center z-40 md:hidden select-none">
        <button 
          type="button"
          onClick={() => setActiveTab('asistente')}
          className={`flex flex-col items-center gap-1 focus:outline-none ${activeTab === 'asistente' ? 'text-indigo-400 font-bold scale-[1.03]' : 'text-slate-455'}`}
        >
          <Icon name="message-square" className="w-4.5 h-4.5" />
          <span className="text-[8px] uppercase tracking-wider font-extrabold">Aura</span>
        </button>
        <button 
          type="button"
          onClick={() => setActiveTab('tareas')}
          className={`flex flex-col items-center gap-1 focus:outline-none ${activeTab === 'tareas' ? 'text-indigo-400 font-bold scale-[1.03]' : 'text-slate-455'}`}
        >
          <Icon name="check-square" className="w-4.5 h-4.5" />
          <span className="text-[8px] uppercase tracking-wider font-extrabold">Tareas</span>
        </button>
        <button 
          type="button"
          onClick={() => setActiveTab('notas')}
          className={`flex flex-col items-center gap-1 focus:outline-none ${activeTab === 'notas' ? 'text-indigo-400 font-bold scale-[1.03]' : 'text-slate-455'}`}
        >
          <Icon name="file-text" className="w-4.5 h-4.5" />
          <span className="text-[8px] uppercase tracking-wider font-extrabold">Notas</span>
        </button>
        <button 
          type="button"
          onClick={() => setActiveTab('habitos')}
          className={`flex flex-col items-center gap-1 focus:outline-none ${activeTab === 'habitos' ? 'text-indigo-400 font-bold scale-[1.03]' : 'text-slate-455'}`}
        >
          <Icon name="activity" className="w-4.5 h-4.5" />
          <span className="text-[8px] uppercase tracking-wider font-extrabold">Hábitos</span>
        </button>
      </nav>

      {/* PROFILE SETTINGS TRIGGER DRAWER */}
      {isProfileSettingsOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0" onClick={() => setIsProfileSettingsOpen(false)}></div>
          <div className="w-full max-w-sm bg-slate-900 border border-slate-850 rounded-3xl p-6 relative z-10 animate-slide-up flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-black text-sm text-white uppercase tracking-wider">Ajustes de Perfil</h3>
              <button 
                type="button"
                onClick={() => setIsProfileSettingsOpen(false)}
                className="p-1 px-2 hover:bg-slate-850 text-slate-500 hover:text-white rounded-lg transition-all focus:outline-none"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-950/60 border border-slate-850 rounded-2xl">
              <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl shrink-0">
                {currentUser.avatar}
              </div>
              <div>
                <span className="block font-black text-xs text-white">{currentUser.username}</span>
                <span className="block text-[9px] text-slate-500 truncate mt-0.5">{currentUser.email}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[9px] uppercase font-bold text-slate-550 tracking-wider">Cambiar Avatar</span>
              <div className="grid grid-cols-6 gap-2 p-2 bg-slate-950/40 border border-slate-850/60 rounded-xl max-h-[105px] overflow-y-auto custom-scroll">
                {['💼', '💰', '💳', '🦁', '🦊', '🐉', '🚀', '💎', '🎨', '🧁', '⚽', '🎯', '🥑', '🍕', '🐱', '🐶'].map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleUpdateAvatar(emoji)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-base transition-all hover:bg-slate-855 focus:outline-none active:scale-90 ${currentUser.avatar === emoji ? 'bg-indigo-650/30 border border-indigo-500/50 text-white scale-[1.1]' : 'border border-transparent'}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5 mt-2">
              <button
                type="button"
                onClick={() => {
                  handleLogout();
                  setIsProfileSettingsOpen(false);
                }}
                className="w-full py-2.5 bg-slate-850 hover:bg-slate-800 border border-slate-800 rounded-xl font-bold text-xs text-slate-300 active:scale-95 transition-all focus:outline-none flex items-center justify-center gap-2 cursor-pointer"
              >
                <Icon name="log-out" className="w-3.5 h-3.5 text-rose-455" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
