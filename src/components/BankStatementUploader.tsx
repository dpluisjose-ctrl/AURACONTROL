import React, { useState } from 'react';
import { Camera, Loader2, UploadCloud, Check, Plus, Calendar, AlertCircle, X, ChevronRight } from 'lucide-react';
import { Transaction, Account, formatCurrencyVal } from '../types';

interface Props {
  accounts: Account[];
  transactions: Transaction[];
  onImport: (newTransactions: {
    type: 'income' | 'expense' | 'transfer';
    accountId: string;
    amount: number;
    category: string;
    date: string;
    description: string;
  }[]) => void;
  onClose: () => void;
}

export function BankStatementUploader({ accounts, transactions, onImport, onClose }: Props) {
  // Setup default account (VES first if available)
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    const vesAccount = accounts.find(a => a.currency === 'VES');
    return vesAccount ? vesAccount.id : (accounts[0]?.id || '');
  });
  
  // Choose system target date. Default is '2026-05-23' (today) as requested
  const [systemTargetDate, setSystemTargetDate] = useState<string>('2026-05-23');

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Results view states
  const [scanResult, setScanResult] = useState<{
    latestCaptureDate: string;
    bankName: string;
    captureGroup: {
      date: string;
      description: string;
      amount: number;
      type: 'income' | 'expense';
      normalizedDate: string;
      isDuplicate: boolean;
    }[];
  } | null>(null);

  const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(selectedFile);
    }
  };

  const normalizeDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const trimmed = dateStr.trim();
    
    // Match YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    
    // Match DD/MM/YYYY or DD-MM-YYYY
    const matchDMY = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
    if (matchDMY) {
      return `${matchDMY[3]}-${matchDMY[2].padStart(2, '0')}-${matchDMY[1].padStart(2, '0')}`;
    }
    
    // Match YYYY/MM/DD
    const matchYMD = trimmed.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/);
    if (matchYMD) {
      return `${matchYMD[1]}-${matchYMD[2].padStart(2, '0')}-${matchYMD[3].padStart(2, '0')}`;
    }
    
    return trimmed;
  };

  const uploadAndParse = async () => {
    if (!file) return;
    setLoading(true);
    
    // Convert to base64
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
      const base64String = (reader.result as string).split(',')[1];
      
      try {
        const response = await fetch('/api/parse-statement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            imageBase64: base64String, 
            mimeType: file.type 
          }),
        });
        
        if (!response.ok) throw new Error('Error al procesar la imagen');
        
        // Parsed JSON: { bankName: string, transactions: [{ date, description, amount, type }] }
        const parsedResponse = await response.json();
        
        let rawTransactions: any[] = [];
        let detectedBank = 'Banco de la captura';

        if (parsedResponse && typeof parsedResponse === 'object' && !Array.isArray(parsedResponse)) {
          rawTransactions = parsedResponse.transactions || [];
          detectedBank = parsedResponse.bankName || 'Banco de la captura';
        } else if (Array.isArray(parsedResponse)) {
          rawTransactions = parsedResponse;
        }

        if (rawTransactions.length === 0) {
          alert('No se encontraron transacciones en la imagen. Por favor, intenta con otra foto más clara.');
          setLoading(false);
          return;
        }

        // Normalize dates, types, and negative signs inside parsed transactions
        const parsedNormalized = rawTransactions.map((t: any) => {
          let originalAmount = Number(t.amount);
          if (isNaN(originalAmount)) originalAmount = 0;

          let transactionType = 'expense';
          
          // If the parsed amount is negative, it's definitely an expense!
          if (originalAmount < 0) {
            transactionType = 'expense';
          } else {
            const cleanedType = String(t.type || '').toLowerCase().trim();
            if (
              cleanedType === 'income' || 
              cleanedType === 'deposit' || 
              cleanedType === 'abono' || 
              cleanedType === 'deposito' || 
              cleanedType === 'transferencia_recibida' || 
              cleanedType === 'ingreso'
            ) {
              transactionType = 'income';
            } else {
              transactionType = 'expense';
            }
          }

          return {
            ...t,
            amount: Math.abs(originalAmount),
            type: transactionType,
            normalizedDate: normalizeDate(t.date)
          };
        });

        // Find the "ultimo grupo con fechas coincidentes en el capture" (i.e. chronological latest date)
        const uniqueDates = Array.from(
          new Set(parsedNormalized.map((t: any) => t.normalizedDate).filter(Boolean))
        ) as string[];

        // Sort decreasing (latest date first)
        uniqueDates.sort((a, b) => b.localeCompare(a));
        const latestCaptureDate = uniqueDates[0] || '';

        // Filter the group matching this latest capture date
        const rawGroup = parsedNormalized.filter((t: any) => t.normalizedDate === latestCaptureDate);

        // Fetch System's latest 20 matching transactions for the chosen target date & account
        const systemMatches = transactions
          .filter(t => t.accountId === selectedAccountId && t.date === systemTargetDate)
          .slice(0, 20);

        // Keep a mutable pool of matching system transactions to support frequency/occurrence matching
        const availableSystemPool = systemMatches.map(sys => ({
          amount: sys.amount,
          type: sys.type,
          used: false
        }));

        // Perform duplicate analysis based on exact amount frequency
        const processedGroup = rawGroup.map((cap: any) => {
          // Find first unused transaction in system pool that matches both amount and transaction type
          const matchedPoolIndex = availableSystemPool.findIndex(sys => 
            !sys.used &&
            Math.abs(sys.amount - cap.amount) < 0.01 &&
            sys.type === cap.type
          );

          let isDuplicate = false;
          if (matchedPoolIndex !== -1) {
            // Consume this matching transaction so other occurrences aren't skipped
            availableSystemPool[matchedPoolIndex].used = true;
            isDuplicate = true;
          }

          return {
            date: cap.date,
            description: cap.description,
            amount: cap.amount,
            type: cap.type as 'income' | 'expense',
            normalizedDate: cap.normalizedDate,
            isDuplicate
          };
        });

        setScanResult({
          latestCaptureDate,
          bankName: detectedBank,
          captureGroup: processedGroup
        });

      } catch (err) {
        console.error(err);
        alert('Ocurrió un error al escanear el estado de cuenta con Gemini.');
      } finally {
        setLoading(false);
      }
    };
  };

  const handleApplyImports = () => {
    if (!scanResult) return;
    
    // Pick the items that are NOT duplicate (unmatched)
    const unmatched = scanResult.captureGroup.filter(item => !item.isDuplicate);

    if (unmatched.length === 0) {
      alert('Todos los movimientos ya se encuentran registrados en el sistema. No hay transacciones nuevas para añadir.');
      onClose();
      return;
    }

    // Map to Transaction structures to import
    const newTrans = unmatched.map(item => {
      // Choose logical default category
      let category = 'other';
      const desc = item.description.toLowerCase();
      if (item.type === 'income') {
        category = 'salary';
      } else {
        if (desc.includes('comida') || desc.includes('restaurant') || desc.includes('alimento') || desc.includes('mcdonald') || desc.includes('pizza') || desc.includes('panaderia') || desc.includes('supermercado')) {
          category = 'food';
        } else if (desc.includes('gasolina') || desc.includes('taxi') || desc.includes('uber') || desc.includes('carro') || desc.includes('auto') || desc.includes('pasaje')) {
          category = 'transport';
        } else if (desc.includes('cine') || desc.includes('netflix') || desc.includes('spotify') || desc.includes('parque') || desc.includes('concierto')) {
          category = 'entertainment';
        } else if (desc.includes('cantv') || desc.includes('luz') || desc.includes('agua') || desc.includes('gas') || desc.includes('internet') || desc.includes('mobile') || desc.includes('telefono')) {
          category = 'utilities';
        } else if (desc.includes('compra') || desc.includes('ropa') || desc.includes('mall') || desc.includes('tienda') || desc.includes('zapatos')) {
          category = 'shopping';
        }
      }

      // Prepend detected bank name to description for instant visual clarity e.g. [Mercantil] Almuerzo
      const bankPrefix = scanResult.bankName ? `[${scanResult.bankName}] ` : '';
      const finalDescription = item.description.startsWith('[') ? item.description : `${bankPrefix}${item.description}`;

      return {
        type: item.type,
        accountId: selectedAccountId,
        amount: item.amount,
        category,
        date: systemTargetDate, // Added automatizadamente to system calendar chosen date
        description: finalDescription,
        bank: scanResult.bankName
      };
    });

    onImport(newTrans);
    alert(`¡Éxito! Se agregaron automáticamente ${newTrans.length} transacciones sin duplicados.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fade-in font-sans">
      <div className="absolute inset-0 cursor-default" onClick={onClose} />
      
      <div className="w-full max-w-xl bg-slate-900 rounded-3xl relative z-10 animate-slide-up shadow-2xl border border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div>
            <h3 className="font-display font-black text-xl text-white">Escanear Estado de Cuenta</h3>
            <p className="text-xs text-slate-400 mt-1">Sincronización automatizada inteligente con Gemini AI</p>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto custom-scroll flex-1 space-y-5">
          
          {!scanResult ? (
            <>
              {/* Form Parameters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-850">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase">Cuenta de Destino</label>
                  <select 
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.currency === 'USD' ? '$' : 'Bs.'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase">Fecha en Sistema</label>
                    <span className="text-[10px] text-indigo-400 font-bold">Por defecto: Hoy</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="date" 
                      value={systemTargetDate}
                      onChange={(e) => setSystemTargetDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Upload Dropzone */}
              {!preview ? (
                <label className="flex flex-col items-center justify-center w-full h-64 bg-slate-950 border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-2xl cursor-pointer hover:bg-slate-850/40 transition p-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-4 animate-pulse-slow">
                    <UploadCloud size={28} />
                  </div>
                  <span className="text-sm font-bold text-white mb-1">Arrastra o selecciona la captura</span>
                  <span className="text-xs text-slate-500 max-w-sm">
                    Sube una foto legible del estado de cuenta de tu banco para realizar la verificación cruzada de movimientos.
                  </span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                </label>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 max-h-64 flex items-center justify-center p-2">
                    <img src={preview} alt="Vista previa del capture" className="max-h-60 max-w-full object-contain rounded-xl" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button 
                      type="button"
                      onClick={() => { setPreview(null); setFile(null); }}
                      className="py-3 rounded-xl border border-slate-800 text-xs font-bold text-slate-400 hover:bg-slate-850/40 transition select-none cursor-pointer"
                    >
                      Cambiar foto
                    </button>
                    <button 
                      type="button"
                      onClick={uploadAndParse}
                      disabled={loading || !selectedAccountId}
                      className="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-bold text-white flex items-center justify-center gap-2 transition select-none cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="animate-spin w-4 h-4" />
                          Procesando con Gemini...
                        </>
                      ) : (
                        <>
                          <Camera size={16} />
                          Escanear Movimientos
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Results Step */
            <div className="space-y-4">
              {/* Summary Dashboard and Explanatory Context */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-3.5">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-sm text-white">Análisis del Capture</h4>
                    <span className="text-[11px] text-slate-400 mt-0.5 block">
                      Banco del comprobante: <span className="text-emerald-400 font-black">{scanResult.bankName}</span>
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5 block">
                      Última fecha del capture procesada: <span className="text-amber-400 font-bold">{scanResult.latestCaptureDate}</span>
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 font-bold block">Comparación en Cuenta</span>
                    <span className="text-xs text-indigo-400 font-semibold block mt-0.5">
                      {selectedAccount?.name} ({systemTargetDate})
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-850/60 pt-3">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Comparando el último grupo de transacciones con fecha del capture ({scanResult.latestCaptureDate}) contra los <span className="text-slate-200 font-semibold">últimos 20 registros</span> de fecha <span className="text-slate-200 font-semibold">{systemTargetDate}</span> en el sistema. Las transacciones no encontradas serán integradas automáticamente de forma inteligente.
                  </p>
                </div>
              </div>

              {/* List of elements */}
              <div className="space-y-2">
                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Movimientos Detectados ({scanResult.latestCaptureDate})</h5>
                
                <div className="space-y-2 max-h-[25vh] overflow-y-auto custom-scroll pr-1">
                  {scanResult.captureGroup.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-850/60">
                      <div className="flex items-center gap-3 shrink-1 min-w-0 pr-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                          item.type === 'income' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                        }`}>
                          {item.type === 'income' ? '+' : '-'}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-bold text-white truncate">{item.description}</p>
                          <span className="text-[10px] text-slate-400 font-medium">Capture: {item.date}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className={`text-xs font-bold ${
                            item.type === 'income' ? 'text-emerald-400' : 'text-slate-200'
                          }`}>
                            {formatCurrencyVal(item.amount, selectedAccount?.currency)}
                          </p>
                        </div>

                        {item.isDuplicate ? (
                          <span className="px-2.5 py-1 rounded-full bg-slate-850 text-slate-500 text-[9px] font-black tracking-wider flex items-center gap-1">
                            <Check size={8} />
                            OMITIDO
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-indigo-505/20 text-indigo-400 border border-indigo-500/30 text-[9px] font-black tracking-wider flex items-center gap-1">
                            <Plus size={8} />
                            NUEVO
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setScanResult(null)}
                  className="py-3 rounded-xl border border-slate-800 text-xs font-bold text-slate-400 hover:bg-slate-850/40 transition select-none cursor-pointer"
                >
                  Volver a escanear
                </button>
                <button 
                  type="button"
                  onClick={handleApplyImports}
                  className="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white flex items-center justify-center gap-2 transition select-none cursor-pointer"
                >
                  <Check size={14} strokeWidth={3} />
                  Sincronizar e Importar
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
