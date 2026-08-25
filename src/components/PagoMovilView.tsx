import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Smartphone, Send, QrCode, ClipboardList, BookUser, Check, Copy, RefreshCw, Plus, X, Search, Trash2, ArrowUpDown } from 'lucide-react';
import { Account, Transaction, formatCurrencyVal } from '../types';

interface Contact {
  id: string;
  name: string;
  bankCode: string;
  bankName: string;
  phonePrefix: string;
  phoneNumber: string;
  docType: string;
  docNumber: string;
}

interface PagoMovilTx {
  id: string;
  beneficiaryName: string;
  docType: string;
  docNumber: string;
  phonePrefix: string;
  phoneNumber: string;
  bankCode: string;
  bankName: string;
  amountVES: number;
  amountUSD: number;
  referenceId: string;
  originAccountName: string;
  date: string;
  dateFormatted: string;
}

interface PagoMovilViewProps {
  accounts: Account[];
  transactions: Transaction[];
  exchangeRate: number;
  bcvRate: number;
  onExecutePayment: (data: {
    accountId: string;
    amount: number; // always in VES, so we update account balance
    description: string;
    category: string;
    type: 'expense';
  }) => Promise<void>;
}

const VENEZUELAN_BANKS = [
  { code: '0134', name: 'Banesco' },
  { code: '0102', name: 'Banco de Venezuela' },
  { code: '0108', name: 'BBVA Provincial' },
  { code: '0105', name: 'Banco Mercantil' },
  { code: '0172', name: 'Bancamiga' },
  { code: '0114', name: 'Bancaribe' },
  { code: '0169', name: 'Banco Activo' },
  { code: '0175', name: 'Banco Bicentenario' },
  { code: '0128', name: 'Banco Caroní' },
  { code: '0115', name: 'Banco Exterior' },
  { code: '0191', name: 'Banco Nacional de Crédito (BNC)' },
  { code: '0168', name: 'Bancrecer' },
  { code: '0177', name: 'Banfanb' },
  { code: '0174', name: 'Banplus' },
  { code: '0157', name: 'DelSur' },
  { code: '0151', name: 'Fondo Común (BFC)' },
  { code: '0163', name: 'Mi Banco' }
];

const PHONE_PREFIXES = ['0412', '0414', '0424', '0416', '0426', '0422'];
const DOC_TYPES = ['V-', 'E-', 'J-', 'G-'];

const DEFAULT_CONTACTS: Contact[] = [
  {
    id: 'pmc-1',
    name: 'Carlos Mendoza',
    bankCode: '0134',
    bankName: 'Banesco',
    phonePrefix: '0412',
    phoneNumber: '1234567',
    docType: 'V-',
    docNumber: '12345678'
  },
  {
    id: 'pmc-2',
    name: 'Ana María Gómez',
    bankCode: '0102',
    bankName: 'Banco de Venezuela',
    phonePrefix: '0416',
    phoneNumber: '9876543',
    docType: 'V-',
    docNumber: '87654321'
  }
];

export default function PagoMovilView({ accounts, transactions, exchangeRate, bcvRate, onExecutePayment }: PagoMovilViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'send' | 'receive' | 'directory' | 'history'>('send');
  
  // Storage keys depending on logged-in user if available
  const getUserSuffix = () => {
    try {
      const loggedUser = localStorage.getItem('wallet_logged_in_user');
      return loggedUser ? JSON.parse(loggedUser).id : 'global';
    } catch {
      return 'global';
    }
  };

  // Contacts / Directory State
  const [contacts, setContacts] = useState<Contact[]>(() => {
    try {
      const stored = localStorage.getItem(`pagomovil_contacts_${getUserSuffix()}`);
      return stored ? JSON.parse(stored) : DEFAULT_CONTACTS;
    } catch {
      return DEFAULT_CONTACTS;
    }
  });

  // Pago Móvil Specific History
  const [pmHistory, setPmHistory] = useState<PagoMovilTx[]>(() => {
    try {
      const stored = localStorage.getItem(`pagomovil_history_${getUserSuffix()}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Save state helpers
  useEffect(() => {
    localStorage.setItem(`pagomovil_contacts_${getUserSuffix()}`, JSON.stringify(contacts));
  }, [contacts]);

  useEffect(() => {
    localStorage.setItem(`pagomovil_history_${getUserSuffix()}`, JSON.stringify(pmHistory));
  }, [pmHistory]);

  // Form states (Enviar Pago)
  const vesAccounts = accounts.filter(acc => acc.currency === 'VES');
  const [originAccountId, setOriginAccountId] = useState<string>(() => {
    return vesAccounts[0]?.id || (accounts[0]?.id || '');
  });
  
  const [name, setName] = useState('');
  const [bankCode, setBankCode] = useState('0134'); // Default Banesco
  const [phonePrefix, setPhonePrefix] = useState('0412'); // Default Digitel
  const [phoneNumber, setPhoneNumber] = useState('');
  const [docType, setDocType] = useState('V-');
  const [docNumber, setDocNumber] = useState('');
  const [montoInput, setMontoInput] = useState('0.00');
  const [montoCurrency, setMontoCurrency] = useState<'VES' | 'USD'>('VES');

  // Directory addition states
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newCName, setNewCName] = useState('');
  const [newCBankCode, setNewCBankCode] = useState('0134');
  const [newCPhonePrefix, setNewCPhonePrefix] = useState('0412');
  const [newCPhoneNumber, setNewCPhoneNumber] = useState('');
  const [newCDocType, setNewCDocType] = useState('V-');
  const [newCDocNumber, setNewCDocNumber] = useState('');

  // Receiving state parameters
  const [recAccountId, setRecAccountId] = useState<string>(() => {
    return vesAccounts[0]?.id || '';
  });
  const [recPhonePrefix, setRecPhonePrefix] = useState('0412');
  const [recPhoneNumber, setRecPhoneNumber] = useState('');
  const [recDocType, setRecDocType] = useState('V-');
  const [recDocNumber, setRecDocNumber] = useState('');
  const [recBankCode, setRecBankCode] = useState('0134');
  const [recAmount, setRecAmount] = useState('');
  const [generatedReceiveQR, setGeneratedReceiveQR] = useState<string | null>(null);

  // Active Receipt Display (when a transaction is made, or clicked from history)
  const [activeReceipt, setActiveReceipt] = useState<PagoMovilTx | null>(null);

  // Copied indicator triggers
  const [copiedStructured, setCopiedStructured] = useState(false);
  const [copiedSMS, setCopiedSMS] = useState(false);

  // Trigger form filling when contact card is clicked and automatically copy formatted payment details
  const handleSelectContact = async (c: Contact) => {
    setName(c.name);
    setBankCode(c.bankCode);
    setPhonePrefix(c.phonePrefix);
    setPhoneNumber(c.phoneNumber);
    setDocType(c.docType);
    setDocNumber(c.docNumber);

    const formattedContactText = `Banco: ${c.bankName}
Cédula: ${c.docType}-${c.docNumber}
Teléfono: ${c.phonePrefix}-${c.phoneNumber}
Monto: 0.00`;

    try {
      await navigator.clipboard.writeText(formattedContactText);
    } catch (err) {
      console.warn("Could not auto-copy contact:", err);
    }
  };

  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCName || !newCPhoneNumber || !newCDocNumber) {
      alert('Por favor completa todos los campos del contacto.');
      return;
    }
    const bank = VENEZUELAN_BANKS.find(b => b.code === newCBankCode);
    const newContact: Contact = {
      id: 'pmc-' + Date.now(),
      name: newCName,
      bankCode: newCBankCode,
      bankName: bank ? bank.name : 'Unknown',
      phonePrefix: newCPhonePrefix,
      phoneNumber: newCPhoneNumber,
      docType: newCDocType,
      docNumber: newCDocNumber
    };

    setContacts(prev => [newContact, ...prev]);
    setIsAddingContact(false);
    // Clear inputs
    setNewCName('');
    setNewCPhoneNumber('');
    setNewCDocNumber('');
    alert('Contacto agregado con éxito.');
  };

  const handleDeleteContact = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setContacts(prev => prev.filter(c => c.id !== id));
  };

  const executePagoMovil = async () => {
    const rawVal = parseFloat(montoInput);
    if (isNaN(rawVal) || rawVal <= 0) {
      alert('Por favor ingresa un monto válido mayor a cero.');
      return;
    }
    if (!name.trim()) {
      alert('Por favor ingresa el nombre del beneficiario.');
      return;
    }
    if (!phoneNumber.trim() || phoneNumber.length < 7) {
      alert('Por favor ingresa un número de teléfono válido (7 dígitos mínimo).');
      return;
    }
    if (!docNumber.trim() || docNumber.length < 5) {
      alert('Por favor ingresa un número de documento de identidad válido.');
      return;
    }

    // Determine values in both currencies
    let valVES = 0;
    let valUSD = 0;
    
    if (montoCurrency === 'VES') {
      valVES = rawVal;
      valUSD = valVES / bcvRate;
    } else {
      valUSD = rawVal;
      valVES = valUSD * bcvRate;
    }

    const selectedAcc = accounts.find(a => a.id === originAccountId);
    if (!selectedAcc) {
      alert('No se encontró la cuenta de origen de fondos.');
      return;
    }

    // Verify funds check for Bolívares (allow overdraft automatically in sandboxed iFrame)
    const baseVesBalance = selectedAcc.currency === 'VES' ? selectedAcc.balance : selectedAcc.balance * bcvRate;
    if (baseVesBalance < valVES) {
      console.log('Sobregiro simulado autorizado automáticamente para la simulación.');
    }

    const targetBank = VENEZUELAN_BANKS.find(b => b.code === bankCode);
    const bankName = targetBank ? targetBank.name : 'Banco Destino';

    try {
      // Create unique Pago Móvil reference id
      const refCount = Math.floor(100000 + Math.random() * 900000);
      const refId = `REC-${refCount}`;

      // Create local payment register
      const dateNow = new Date();
      const localizedDateStr = dateNow.toLocaleString('es-VE', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      const pmTx: PagoMovilTx = {
        id: 'pmtx-' + Date.now(),
        beneficiaryName: name,
        docType,
        docNumber,
        phonePrefix,
        phoneNumber,
        bankCode,
        bankName,
        amountVES: valVES,
        amountUSD: valUSD,
        referenceId: refId,
        originAccountName: selectedAcc.name,
        date: dateNow.toISOString().split('T')[0],
        dateFormatted: localizedDateStr
      };

      // Construct and copy the requested structured formatted text automatically
      const structuredFormatToCopy = `Banco: ${bankName}
Cédula: ${docType}-${docNumber}
Teléfono: ${phonePrefix}-${phoneNumber}
Monto: ${valVES.toFixed(2)}`;

      try {
        await navigator.clipboard.writeText(structuredFormatToCopy);
      } catch (clipboardErr) {
        console.warn("No se pudo copiar automáticamente al portapapeles:", clipboardErr);
      }

      // Add to general account transactions (which deducts funds & syncs to cloud)
      // Represent transaction with full details
      const paymentDescription = `Pago Móvil: ${name} (${bankName} Ref: ${refId})`;
      
      // Amount to deduct is converted if selectedAccount currency is USD
      const debitAmount = selectedAcc.currency === 'VES' ? valVES : valUSD;

      await onExecutePayment({
        accountId: originAccountId,
        amount: debitAmount,
        description: paymentDescription,
        category: 'transfer',
        type: 'expense'
      });

      // Save to PM History local array
      setPmHistory(prev => [pmTx, ...prev]);

      // Trigger active receipt rendering
      setActiveReceipt(pmTx);

      // Clean Enviar fields (except bank codes to maintain workflow)
      setMontoInput('0.00');
      setPhoneNumber('');
      setDocNumber('');
      setName('');

    } catch (e) {
      console.error(e);
      alert('Ocurrió un error al procesar el pago móvil.');
    }
  };

  const handleCopyText = (text: string, type: 'structured' | 'sms') => {
    navigator.clipboard.writeText(text);
    if (type === 'structured') {
      setCopiedStructured(true);
      setTimeout(() => setCopiedStructured(false), 2000);
    } else {
      setCopiedSMS(true);
      setTimeout(() => setCopiedSMS(false), 2000);
    }
  };

  // Generate customized inbound Pago movil receiver code
  const handleGenerateReceiveQR = () => {
    if (!recPhoneNumber || recPhoneNumber.length < 7) {
      alert('Ingresa el número telefónico receptor.');
      return;
    }
    if (!recDocNumber) {
      alert('Ingresa el número de documento.');
      return;
    }

    const tBank = VENEZUELAN_BANKS.find(b => b.code === recBankCode);
    const code = recBankCode;
    const phone = `${recPhonePrefix}${recPhoneNumber}`;
    const doc = `${recDocType}${recDocNumber}`.replace('-', '');
    const amt = parseFloat(recAmount);

    // Suiche 7B QR Content Format: pagomovil:co:BANK_CODE:PHONE:DOC_TYPE_DOC_NUMBER:AMOUNT
    // If no amount, standard format is: pagomovil:co:BANK_CODE:PHONE:DOC_TYPE_DOC_NUMBER
    let qrString = `pagomovil:co:${code}:${phone}:${doc}`;
    if (!isNaN(amt) && amt > 0) {
      qrString += `:${amt.toFixed(2)}`;
    }

    const encoded = encodeURIComponent(qrString);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}&margin=2&bgcolor=ffffff&color=0f172a`;
    setGeneratedReceiveQR(qrUrl);
  };

  // Pre-fill receiver settings based on selected local account
  useEffect(() => {
    const acc = accounts.find(a => a.id === recAccountId);
    if (acc) {
      // Find matching bank code if any by scanning account bank name
      const matchingBank = VENEZUELAN_BANKS.find(b => 
        (acc.bank || '').toLowerCase().includes(b.name.toLowerCase()) ||
        (acc.name || '').toLowerCase().includes(b.name.toLowerCase())
      );
      if (matchingBank) {
        setRecBankCode(matchingBank.code);
      }
    }
  }, [recAccountId, accounts]);

  return (
    <div className="p-4 md:p-6 text-white min-h-[80vh] font-sans">
      
      {/* Receipts Visual Canvas Trigger */}
      {activeReceipt ? (
        <div className="max-w-md mx-auto bg-slate-950 border border-slate-900 rounded-[32px] p-6 shadow-2xl relative animate-fade-in my-2">
          
          {/* Animated Green Check Ring */}
          <div className="flex flex-col items-center text-center mt-3 mb-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 animate-pulse-slow">
              <Check size={32} strokeWidth={3} className="animate-bounce-short" />
            </div>
            <span className="text-[10px] font-black tracking-[0.15em] text-emerald-400 uppercase">Pago Móvil Exitoso</span>
            
            <h2 className="text-3xl font-display font-black text-emerald-300 mt-2">
              Bs.S {activeReceipt.amountVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <span className="text-xs text-slate-400 mt-1 font-mono">
              (${activeReceipt.amountUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
            </span>
          </div>

          {/* Receipt Info Fields */}
          <div className="bg-slate-900/60 rounded-2xl border border-slate-850 p-4 space-y-3 font-medium text-xs mb-6">
            <div className="flex justify-between items-center text-slate-400">
              <span>Beneficiario:</span>
              <span className="text-white font-bold">{activeReceipt.beneficiaryName}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Documento C.I.:</span>
              <span className="text-white font-mono font-semibold">{activeReceipt.docType}{activeReceipt.docNumber}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Teléfono Destino:</span>
              <span className="text-white font-mono font-semibold">{activeReceipt.phonePrefix}{activeReceipt.phoneNumber}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Banco:</span>
              <span className="text-white font-bold">{activeReceipt.bankName}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Referencia ID:</span>
              <span className="text-indigo-400 font-mono font-bold tracking-wider">{activeReceipt.referenceId}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400 border-t border-slate-850 pt-3">
              <span>Cuenta Origen:</span>
              <span className="text-slate-300">{activeReceipt.originAccountName}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Fecha de Registro:</span>
              <span className="text-slate-300 font-mono text-[10px]">{activeReceipt.dateFormatted}</span>
            </div>
          </div>

          {/* QR Suiche 7B */}
          <div className="flex flex-col items-center bg-white p-4 rounded-3xl mx-auto w-fit mb-6 shadow-xl border border-slate-200">
            <img 
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                `pagomovil:co:${activeReceipt.bankCode}:${activeReceipt.phonePrefix}${activeReceipt.phoneNumber}:${activeReceipt.docType.replace('-', '')}${activeReceipt.docNumber}:${activeReceipt.amountVES.toFixed(2)}`
              )}&margin=1&bgcolor=ffffff&color=0f172a`} 
              alt="Código QR Suiche 7B" 
              className="w-40 h-40"
              referrerPolicy="no-referrer"
            />
            <span className="text-[9px] font-black tracking-wider text-slate-800 uppercase mt-2 font-mono">CÓDIGO QR SUICHE 7B</span>
          </div>

          {/* Copy Blocks */}
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-4">
              <span className="text-[9px] font-black tracking-wider text-emerald-400 uppercase">Formato de Texto Estructurado</span>
              <div className="flex justify-between items-start mt-2">
                <pre className="text-[10px] text-slate-300 font-mono leading-relaxed truncate select-all">
{`Banco: ${activeReceipt.bankName}
Cédula: ${activeReceipt.docType}${activeReceipt.docNumber}
Teléfono: ${activeReceipt.phonePrefix}-${activeReceipt.phoneNumber}
Monto: ${activeReceipt.amountVES.toFixed(2)}`}
                </pre>
                <button
                  type="button"
                  onClick={() => handleCopyText(`Banco: ${activeReceipt.bankName}\nCédula: ${activeReceipt.docType}${activeReceipt.docNumber}\nTeléfono: ${activeReceipt.phonePrefix}-${activeReceipt.phoneNumber}\nMonto: ${activeReceipt.amountVES.toFixed(2)}`, 'structured')}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 transition ml-2"
                  title="Copiar texto"
                >
                  {copiedStructured ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-4">
              <span className="text-[9px] font-black tracking-wider text-indigo-400 uppercase">SMS de Envío TPAGO / Copiable</span>
              <div className="flex items-center justify-between mt-2">
                <code className="text-[11px] text-slate-200 bg-slate-950 p-2 rounded-lg font-mono flex-1 mr-2 select-all overflow-x-auto whitespace-nowrap">
                  {`TPAGO ${activeReceipt.bankCode} ${activeReceipt.phonePrefix}${activeReceipt.phoneNumber} ${activeReceipt.docType.replace('-', '')}${activeReceipt.docNumber} ${activeReceipt.amountVES.toFixed(2).replace('.', ',')}`}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopyText(`TPAGO ${activeReceipt.bankCode} ${activeReceipt.phonePrefix}${activeReceipt.phoneNumber} ${activeReceipt.docType.replace('-', '')}${activeReceipt.docNumber} ${activeReceipt.amountVES.toFixed(2).replace('.', ',')}`, 'sms')}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400 transition"
                  title="Copiar SMS"
                >
                  {copiedSMS ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveReceipt(null)}
            className="w-full mt-6 py-3 bg-indigo-650 hover:bg-indigo-600 font-bold text-xs text-white rounded-2xl transition shadow-lg select-none cursor-pointer text-center flex items-center justify-center gap-1.5"
          >
            ← Hacer una nueva transacción
          </button>

        </div>
      ) : (
        /* Primary Component Content Workspace */
        <div className="space-y-6">
          
          {/* Internal Subsection Tabs Header */}
          <div className="bg-slate-950 rounded-2xl p-1 border border-slate-900 flex flex-wrap gap-1 max-w-4xl mx-auto select-none">
            <button
              onClick={() => { setActiveSubTab('send'); setGeneratedReceiveQR(null); }}
              className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold text-xs transition cursor-pointer ${
                activeSubTab === 'send' ? 'bg-indigo-650 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
              }`}
            >
              <Send size={14} />
              Enviar Pago
            </button>
            <button
              onClick={() => { setActiveSubTab('receive'); setGeneratedReceiveQR(null); }}
              className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold text-xs transition cursor-pointer ${
                activeSubTab === 'receive' ? 'bg-indigo-650 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
              }`}
            >
              <QrCode size={14} />
              Recibir / QR
            </button>
            <button
              onClick={() => { setActiveSubTab('directory'); setGeneratedReceiveQR(null); }}
              className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold text-xs transition cursor-pointer ${
                activeSubTab === 'directory' ? 'bg-indigo-650 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
              }`}
            >
              <BookUser size={14} />
              Directorio
            </button>
            <button
              onClick={() => { setActiveSubTab('history'); setGeneratedReceiveQR(null); }}
              className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold text-xs transition cursor-pointer ${
                activeSubTab === 'history' ? 'bg-indigo-650 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
              }`}
            >
              <ClipboardList size={14} />
              Historial PM
            </button>
          </div>

          <div className="max-w-3xl mx-auto">
            {activeSubTab === 'send' && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="space-y-6"
              >
                
                {/* Form Wrapper Container */}
                <div className="bg-slate-950 border border-slate-905 rounded-[32px] p-6 space-y-5">
                  
                  {/* Origin Funds Selection */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase">Cuenta Origen de Fondos (En Bs.)</label>
                    <select
                      value={originAccountId}
                      onChange={(e) => setOriginAccountId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
                    >
                      {vesAccounts.length === 0 ? (
                        <option value="">Añade primero una cuenta en Bolívares (VES)</option>
                      ) : (
                        vesAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} - Saldo: {formatCurrencyVal(acc.balance, 'VES')}
                          </option>
                        ))
                      )}
                    </select>
                    {vesAccounts.length === 0 && (
                      <p className="text-[10px] text-amber-400 font-bold mt-1">⚠️ No posees cuentas en Bolívares. Crea una en la pestaña "Cuentas" para realizar débitos.</p>
                    )}
                  </div>

                  {/* Favourites Quick Bar */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase block">Favoritos Rápidos</label>
                    <div className="flex gap-2.5 overflow-x-auto pb-1.5 custom-scroll">
                      {contacts.slice(0, 5).map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectContact(c)}
                          className="flex-shrink-0 text-left bg-slate-900 border border-slate-800/80 hover:border-indigo-500/55 rounded-2xl py-3 px-4 transition active:scale-95 cursor-pointer max-w-[140px] focus:outline-none"
                        >
                          <p className="text-xs font-black text-white truncate leading-tight">{c.name}</p>
                          <span className="text-[9px] text-indigo-400 font-black tracking-wider uppercase block mt-1">{c.bankName}</span>
                        </button>
                      ))}
                      {contacts.length === 0 && (
                        <span className="text-xs text-slate-500 italic py-1">No hay favoritos guardados. Agrégalos en "Directorio".</span>
                      )}
                    </div>
                  </div>

                  {/* Beneficiary Name */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase">Nombre del Beneficiario / Razón</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ej. Carlos Mendoza o Empresa C.A."
                      className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
                    />
                  </div>

                  {/* Bank Select */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase">Banco Receptor</label>
                    <select
                      value={bankCode}
                      onChange={(e) => setBankCode(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
                    >
                      {VENEZUELAN_BANKS.map(bank => (
                        <option key={bank.code} value={bank.code}>
                          {bank.code} - {bank.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Phone and Document Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Registered Phone */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase">Teléfono Registrado</label>
                      <div className="flex gap-2">
                        <select
                          value={phonePrefix}
                          onChange={(e) => setPhonePrefix(e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded-2xl px-3 py-3 text-xs text-white focus:outline-none font-medium cursor-pointer w-[120px] shrink-0"
                        >
                          {PHONE_PREFIXES.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                        <input
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 7))}
                          placeholder="1234567"
                          className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono tracking-wider font-semibold"
                        />
                      </div>
                    </div>

                    {/* Document Identification */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase">Cédula o RIF Beneficiario</label>
                      <div className="flex gap-2">
                        <select
                          value={docType}
                          onChange={(e) => setDocType(e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded-2xl px-3 py-3 text-xs text-white focus:outline-none font-medium cursor-pointer w-[120px] shrink-0"
                        >
                          {DOC_TYPES.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={docNumber}
                          onChange={(e) => setDocNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          placeholder="12345678"
                          className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono tracking-wider font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Send Amount Block */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase">Monto a Enviar</label>
                      <div className="flex gap-2 bg-slate-900 border border-slate-800 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setMontoCurrency('VES')}
                          className={`px-3 py-1 text-[10px] font-black rounded-lg transition-all focus:outline-none ${montoCurrency === 'VES' ? 'bg-indigo-650 text-white' : 'text-slate-400'}`}
                        >
                          Bs. (VES)
                        </button>
                        <button
                          type="button"
                          onClick={() => setMontoCurrency('USD')}
                          className={`px-3 py-1 text-[10px] font-black rounded-lg transition-all focus:outline-none ${montoCurrency === 'USD' ? 'bg-indigo-650 text-white' : 'text-slate-400'}`}
                        >
                          USD ($)
                        </button>
                      </div>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        value={montoInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/^\d*\.?\d*$/.test(val)) setMontoInput(val);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 text-xl font-display font-black text-center text-indigo-305 focus:outline-none focus:border-indigo-500"
                      />
                      <div className="absolute right-5 top-1/2 -translate-y-1/2">
                        <span className="w-10 h-10 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-sm">
                          {montoCurrency === 'USD' ? '$' : 'Bs'}
                        </span>
                      </div>
                    </div>

                    {/* Exchange Rate Converter preview */}
                    <div className="flex justify-between items-center text-[11px] text-slate-400 px-2 pt-1 font-mono">
                      <span className="flex items-center gap-1">
                        Equivalencia aprox. <span className="text-[9px] text-slate-500 font-normal opacity-90">(BCV: Bs. {bcvRate.toFixed(2)})</span>:
                      </span>
                      {(() => {
                        const amt = parseFloat(montoInput) || 0;
                        if (montoCurrency === 'VES') {
                          return <span className="text-emerald-400 font-bold">${(amt / bcvRate).toFixed(2)} USD</span>;
                        } else {
                          return <span className="text-emerald-400 font-bold">Bs. {(amt * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES</span>;
                        }
                      })()}
                    </div>
                  </div>

                  {/* Primary Trigger button */}
                  <button
                    type="button"
                    onClick={executePagoMovil}
                    className="w-full mt-2 py-4 bg-indigo-600 hover:bg-indigo-500 font-bold text-sm text-white rounded-2xl transition shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-1.5 select-none cursor-pointer"
                  >
                    <Check size={16} strokeWidth={3} />
                    Ejecutar y Generar Recibo de Pago
                  </button>

                </div>

              </motion.div>
            )}

            {activeSubTab === 'receive' && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                {/* Left controls */}
                <div className="bg-slate-950 border border-slate-900 p-6 rounded-[32px] space-y-4">
                  <h4 className="font-display font-black text-sm text-white">Generar tu código QR</h4>
                  <p className="text-xs text-slate-400">Rellena tus datos para generar el código QR con el estándar oficial de Suiche 7B, que permite cobros inmediatos interbancarios.</p>
                  
                  {/* Shortcut fill from accounts */}
                  <div className="space-y-1.5 pt-2">
                    <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase">Usar datos de cuenta local</label>
                    <select
                      value={recAccountId}
                      onChange={(e) => setRecAccountId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-medium cursor-pointer"
                    >
                      <option value="">-- Autocompletar con cuenta --</option>
                      {vesAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase">Banco Registrado</label>
                    <select
                      value={recBankCode}
                      onChange={(e) => setRecBankCode(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-white font-medium cursor-pointer"
                    >
                      {VENEZUELAN_BANKS.map(b => (
                        <option key={b.code} value={b.code}>{b.code} - {b.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase">Teléfono Beneficiario</label>
                    <div className="flex gap-2">
                      <select
                        value={recPhonePrefix}
                        onChange={(e) => setRecPhonePrefix(e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-2xl px-2.5 py-3 text-xs text-white font-medium cursor-pointer w-[95px] shrink-0"
                      >
                        {PHONE_PREFIXES.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                      <input
                        type="tel"
                        value={recPhoneNumber}
                        onChange={(e) => setRecPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 7))}
                        placeholder="1234567"
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-500 font-mono tracking-wider font-semibold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase">Cédula o RIF</label>
                    <div className="flex gap-2">
                      <select
                        value={recDocType}
                        onChange={(e) => setRecDocType(e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-2xl px-2.5 py-3 text-xs text-white font-medium cursor-pointer w-[95px] shrink-0"
                      >
                        {DOC_TYPES.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={recDocNumber}
                        onChange={(e) => setRecDocNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="12345678"
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-500 font-mono tracking-wider font-semibold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase">Monto (Opcional - En Bs.)</label>
                      <span className="text-[9px] text-indigo-400 font-bold">Vacio para QR Libre</span>
                    </div>
                    <input
                      type="text"
                      value={recAmount}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^\d*\.?\d*$/.test(val)) setRecAmount(val);
                      }}
                      placeholder="0.00"
                      className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-500 font-mono font-bold"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateReceiveQR}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white rounded-xl transition shadow-lg select-none cursor-pointer flex items-center justify-center gap-1"
                  >
                    <QrCode size={14} />
                    Generar código QR
                  </button>

                </div>

                {/* Right outcome view */}
                <div className="bg-slate-950 border border-slate-900 p-6 rounded-[32px] flex flex-col items-center justify-center text-center">
                  {generatedReceiveQR ? (
                    <motion.div 
                      key="qr-active" 
                      initial={{ scale: 0.9, opacity: 0 }} 
                      animate={{ scale: 1, opacity: 1 }} 
                      className="space-y-4 w-full flex flex-col items-center"
                    >
                      <div className="bg-white p-4 rounded-[24px] shadow-xl border border-slate-200">
                        <img 
                          src={generatedReceiveQR} 
                          alt="Código QR Para Cobro" 
                          className="w-48 h-48"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-black text-indigo-300">Cobro Pago Móvil Suiche 7B</h4>
                        <span className="text-xs text-slate-400 font-medium">Bco. {VENEZUELAN_BANKS.find(b => b.code === recBankCode)?.name} • {recPhonePrefix}{recPhoneNumber}</span>
                        {recAmount && (
                          <p className="text-lg font-bold text-emerald-400 mt-1 font-mono">Bs. {parseFloat(recAmount).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                        )}
                      </div>
                      
                      <div className="w-full pt-4 border-t border-slate-900 space-y-2">
                        <button
                          type="button"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = generatedReceiveQR || '';
                            link.target = '_blank';
                            link.download = `recepcion-qr.png`;
                            link.click();
                          }}
                          className="w-full py-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-xs text-slate-300 rounded-xl transition font-medium"
                        >
                          Ver en pantalla completa
                        </button>
                        <button
                          onClick={() => setGeneratedReceiveQR(null)}
                          className="w-full py-2 text-xs text-slate-500 hover:text-slate-300 transition"
                        >
                          Restablecer
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="py-12 space-y-3">
                      <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-850 flex items-center justify-center text-slate-600 mx-auto">
                        <QrCode size={28} />
                      </div>
                      <h4 className="text-sm font-bold text-slate-400">Listo para Generar QR</h4>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto">Completa los campos del formulario izquierdo y presiona el botón para generar tu código QR listo para compartir.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeSubTab === 'directory' && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="space-y-6"
              >
                <div className="flex justify-between items-center select-none">
                  <h4 className="font-display font-black text-sm text-white">Directorio de Beneficiarios</h4>
                  <button
                    onClick={() => setIsAddingContact(!isAddingContact)}
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-650 hover:bg-indigo-600 text-xs font-bold text-white flex items-center gap-1 transition"
                  >
                    {isAddingContact ? <X size={14} /> : <Plus size={14} />}
                    <span>{isAddingContact ? 'Cancelar' : 'Nuevo Beneficiario'}</span>
                  </button>
                </div>

                {isAddingContact && (
                  <motion.form 
                    onSubmit={handleCreateContact}
                    initial={{ opacity: 0, height: 0 }} 
                    animate={{ opacity: 1, height: 'auto' }} 
                    className="bg-slate-950 border border-slate-900 p-5 rounded-2xl space-y-4"
                  >
                    <div className="font-bold text-xs text-indigo-400">Registrar Nuevo Favorito</div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-black text-slate-400">Nombre / Razón</label>
                        <input
                          type="text"
                          required
                          value={newCName}
                          onChange={(e) => setNewCName(e.target.value)}
                          placeholder="Ej. Juan Pérez"
                          className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-black text-slate-400">Banco</label>
                        <select
                          value={newCBankCode}
                          onChange={(e) => setNewCBankCode(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none"
                        >
                          {VENEZUELAN_BANKS.map(b => (
                            <option key={b.code} value={b.code}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-black text-slate-400">Teléfono</label>
                        <div className="flex gap-2">
                          <select
                            value={newCPhonePrefix}
                            onChange={(e) => setNewCPhonePrefix(e.target.value)}
                            className="bg-slate-900 border border-slate-850 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none w-[90px]"
                          >
                            {PHONE_PREFIXES.map(p => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                          <input
                            type="tel"
                            required
                            value={newCPhoneNumber}
                            onChange={(e) => setNewCPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 7))}
                            placeholder="1234567"
                            className="flex-1 bg-slate-900 border border-slate-850 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-black text-slate-400">Documento ID</label>
                        <div className="flex gap-2">
                          <select
                            value={newCDocType}
                            onChange={(e) => setNewCDocType(e.target.value)}
                            className="bg-slate-900 border border-slate-850 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none w-[90px]"
                          >
                            {DOC_TYPES.map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            required
                            value={newCDocNumber}
                            onChange={(e) => setNewCDocNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            placeholder="12345678"
                            className="flex-1 bg-slate-900 border border-slate-850 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-indigo-650 hover:bg-indigo-600 font-bold text-xs text-white rounded-xl transition cursor-pointer select-none"
                    >
                      Guardar en Directorio
                    </button>
                  </motion.form>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {contacts.map(c => (
                    <div 
                      key={c.id} 
                      className="bg-slate-950 border border-slate-900 hover:border-slate-850 p-4 rounded-2xl flex justify-between items-start transition"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                          <p className="text-xs font-black text-white truncate leading-none">{c.name}</p>
                        </div>
                        <span className="text-[10px] font-bold text-indigo-400 uppercase mt-2.5 block">{c.bankName} ({c.bankCode})</span>
                        
                        <div className="mt-2 space-y-0.5 text-[10px] text-slate-400 font-mono font-medium">
                          <p>Tel: {c.phonePrefix}{c.phoneNumber}</p>
                          <p>Dcto: {c.docType}{c.docNumber}</p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => { handleSelectContact(c); setActiveSubTab('send'); }}
                          className="px-3 py-1.5 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-650 hover:text-white rounded-lg text-[10px] font-black transition-all cursor-pointer text-center select-none"
                        >
                          Pagar
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteContact(c.id, e)}
                          className="p-1.5 bg-slate-900 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition ml-auto"
                          title="Eliminar de favoritos"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {contacts.length === 0 && (
                    <div className="col-span-full bg-slate-950 border border-dashed border-slate-900 p-8 rounded-2xl text-center text-xs text-slate-500">
                      No hay beneficiarios guardados en tu lista. Presiona el botón de arriba para registrar uno.
                    </div>
                  )}
                </div>

              </motion.div>
            )}

            {activeSubTab === 'history' && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="space-y-4"
              >
                <div className="flex justify-between items-center select-none">
                  <div>
                    <h4 className="font-display font-black text-sm text-white">Historial de Pago Móvil • tpago</h4>
                    <p className="text-[10px] text-slate-400 mt-1">Registros emitidos a través de este simulador.</p>
                  </div>
                  
                  <button
                    onClick={() => {
                      setPmHistory([]);
                    }}
                    disabled={pmHistory.length === 0}
                    className="text-[10px] font-bold text-red-400 hover:text-red-300 bg-red-950/20 px-2 py-1.5 rounded-lg border border-red-900/20 disabled:opacity-30 transition cursor-pointer"
                  >
                    Vaciar historial
                  </button>
                </div>

                <div className="space-y-3 max-h-[50vh] overflow-y-auto custom-scroll pr-1.5">
                  {pmHistory.map(tx => (
                    <div 
                      key={tx.id} 
                      className="bg-slate-950 border border-slate-900 hover:border-slate-850 p-4 rounded-2xl flex items-center justify-between gap-3 transition"
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 shrink-0">
                          <Smartphone size={18} />
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-black text-white truncate leading-none">{tx.beneficiaryName}</p>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-[9px] text-indigo-400 font-bold uppercase">{tx.bankName}</span>
                            <span className="text-[9px] text-slate-500">•</span>
                            <span className="text-[9px] text-slate-400 font-mono font-semibold">{tx.referenceId}</span>
                          </div>
                          <span className="text-[8px] text-slate-500 mt-1 font-mono block leading-none">{tx.dateFormatted}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex items-center gap-3">
                        <div>
                          <p className="text-xs font-black text-purple-300">Bs. {tx.amountVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                          <span className="text-[9px] text-slate-400 font-mono block mt-0.5">${tx.amountUSD.toFixed(2)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveReceipt(tx)}
                          className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-[10px] font-bold transition whitespace-nowrap cursor-pointer"
                        >
                          Recibo
                        </button>
                      </div>
                    </div>
                  ))}

                  {pmHistory.length === 0 && (
                    <div className="bg-slate-950 border border-dashed border-slate-900 p-12 rounded-2xl text-center text-xs text-slate-500">
                      Aún no has emitido ningún Pago Móvil. Las transacciones que realices se registrarán detalladamente aquí.
                    </div>
                  )}
                </div>

              </motion.div>
            )}

          </div>

        </div>
      )}

    </div>
  );
}
