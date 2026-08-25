import React, { useState, useMemo, useEffect } from 'react';
import { Account, Transaction, Debt, CATEGORIES, CARD_THEMES, formatCurrencyVal } from '../types';
import Icon from './Icon';
import { BankStatementUploader } from './BankStatementUploader';

export { BankStatementUploader };

// ==========================================
// 1. TRANSACTION CONTEXT MODAL
// ==========================================
interface TransactionModalProps {
  accounts: Account[];
  onClose: () => void;
  onSubmit: (data: {
    type: 'income' | 'expense' | 'transfer';
    accountId: string;
    destinationAccountId?: string;
    amount: number;
    category: string;
    date: string;
    description: string;
  }) => void;
}

export function TransactionModal({ accounts, onClose, onSubmit }: TransactionModalProps) {
  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense');
  const [accountId, setAccountId] = useState(() => {
    const vesAccount = accounts.find(a => a.currency === 'VES');
    return vesAccount ? vesAccount.id : (accounts[0]?.id || '');
  });
  const [destinationAccountId, setDestinationAccountId] = useState(() => {
    const primId = accounts.find(a => a.currency === 'VES')?.id || accounts[0]?.id || '';
    const other = accounts.find(a => a.id !== primId);
    return other ? other.id : primId;
  });
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('food');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

  const activeAccount = useMemo(() => accounts.find(a => a.id === accountId), [accountId, accounts]);

  // Adjust categories when transition type converts
  useEffect(() => {
    if (type === 'expense') {
      setCategory('food');
    } else if (type === 'income') {
      setCategory('salary');
    } else {
      setCategory('transfer');
    }
  }, [type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Por favor introduce un monto de operación válido.');
      return;
    }
    if (!accountId) {
      alert('Debes seleccionar una cuenta activa.');
      return;
    }
    if (type === 'transfer' && accountId === destinationAccountId) {
      alert('Las cuentas de origen y destino deben ser distintas.');
      return;
    }

    const defaultDescription = type === 'transfer' 
      ? 'Préstamo registrado' 
      : CATEGORIES[category]?.label || 'Operación';

    onSubmit({
      type,
      accountId,
      destinationAccountId: type === 'transfer' ? destinationAccountId : undefined,
      amount: parsedAmount,
      category: type === 'transfer' ? 'transfer' : category,
      date,
      description: description.trim() || defaultDescription
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center animate-fade-in font-sans">
      <div className="absolute inset-0 cursor-default" onClick={onClose}></div>
      <form 
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-slate-900 rounded-t-3xl border-t border-slate-850 p-6 relative z-10 animate-slide-up flex flex-col gap-4.5 safe-padding-bottom"
      >
        <div className="flex justify-between items-center">
          <h3 className="font-display font-extrabold text-base text-white">Registrar Operación</h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white focus:outline-none">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Type Switcher */}
        <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-900">
          <button 
            type="button" 
            onClick={() => { setType('expense'); }}
            className={`py-2 text-xs font-bold rounded-lg transition-colors ${type === 'expense' ? 'bg-rose-500/20 border border-rose-500/30 text-rose-300' : 'text-slate-400'}`}
          >
            Gasto
          </button>
          <button 
            type="button" 
            onClick={() => { setType('income'); }}
            className={`py-2 text-xs font-bold rounded-lg transition-colors ${type === 'income' ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300' : 'text-slate-400'}`}
          >
            Ingreso
          </button>
          <button 
            type="button" 
            onClick={() => { setType('transfer'); }}
            className={`py-2 text-xs font-bold rounded-lg transition-colors ${type === 'transfer' ? 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-300' : 'text-slate-400'}`}
          >
            Préstamo
          </button>
        </div>

        {/* Amount Input */}
        <div className="bg-slate-950/40 rounded-2xl p-4.5 border border-slate-850 flex flex-col items-center">
          <label className="text-[10px] text-slate-550 uppercase font-black tracking-widest">Monto ({activeAccount?.currency || 'VES'})</label>
          <div className="flex items-center gap-1.5 mt-1 text-white font-display">
            <span className="text-xl font-bold">{activeAccount?.currency === 'VES' ? 'Bs.' : '$'}</span>
            <input 
              type="number" 
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
              className="bg-transparent border-none text-2xl font-black focus:outline-none w-36 text-center placeholder-slate-700"
            />
          </div>
        </div>

        {/* Account Selector */}
        <div className="flex flex-col gap-1.5 w-full">
          <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
            {type === 'transfer' ? 'Cuenta de Origen (Dador del préstamo / Debita)' : 'Vincular a Cuenta / Caja'}
          </label>
          <select 
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-650"
          >
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({formatCurrencyVal(acc.balance, acc.currency)})
              </option>
            ))}
          </select>
        </div>

        {/* Destination Selector (Transfers only) */}
        {type === 'transfer' && (
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Cuenta del Beneficiario (Receptor del Préstamo)</label>
            <select 
              value={destinationAccountId}
              onChange={(e) => setDestinationAccountId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-650"
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({formatCurrencyVal(acc.balance, acc.currency)})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Category Selector */}
        {type !== 'transfer' && (
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Categoría</label>
            <select 
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none"
            >
              {Object.entries(CATEGORIES).map(([key, value]) => {
                if (type === 'expense' && (key === 'salary' || key === 'transfer' || key === 'exchange')) return null;
                if (type === 'income' && key !== 'salary' && key !== 'other') return null;
                return (
                  <option key={key} value={key}>{value.label}</option>
                );
              })}
            </select>
          </div>
        )}

        {/* Description & Date */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Descripción</label>
            <input 
              type="text" 
              placeholder="Ej: Almuerzo, Compras"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Fecha</label>
            <input 
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none"
            />
          </div>
        </div>

        <button 
          type="submit"
          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 rounded-xl font-bold text-xs text-white shadow-lg active:scale-[0.98] transition-transform mt-2 focus:outline-none"
        >
          Confirmar Operación
        </button>
      </form>
    </div>
  );
}

// ==========================================
// 2. ACCOUNT CREATOR/EDITOR MODAL
// ==========================================
interface AccountModalProps {
  editingAccount: Account | null;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    type: 'debit' | 'credit' | 'savings' | 'cash';
    currency: 'USD' | 'VES';
    balance: number;
    limit: number;
    theme: string;
    number: string;
    bank: string;
    dueDate?: string;
  }) => void;
}

export function AccountModal({ editingAccount, onClose, onSubmit }: AccountModalProps) {
  const [name, setName] = useState(editingAccount?.name || '');
  const [type, setType] = useState<'debit' | 'credit' | 'savings' | 'cash'>(editingAccount?.type || 'debit');
  const [currency, setCurrency] = useState<'USD' | 'VES'>(editingAccount?.currency || 'USD');
  const [balance, setBalance] = useState(editingAccount?.balance?.toString() || '');
  const [limit, setLimit] = useState(editingAccount?.limit?.toString() || '');
  const [theme, setTheme] = useState(editingAccount?.theme || 'indigo');
  const [bank, setBank] = useState(editingAccount?.bank || '');
  const [number, setNumber] = useState(editingAccount?.number || '');
  const [dueDate, setDueDate] = useState(editingAccount?.dueDate || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Ingresa el nombre del producto.');
      return;
    }
    if (!bank.trim()) {
      alert('Pon el banco emisor o la moneda.');
      return;
    }

    const cleanNum = number.length === 4 ? number : Math.floor(1000 + Math.random() * 9000).toString();

    onSubmit({
      name: name.trim(),
      type,
      currency,
      balance: parseFloat(balance) || 0,
      limit: type === 'credit' ? (parseFloat(limit) || 0) : 0,
      theme,
      bank: bank.trim(),
      number: cleanNum,
      dueDate: type === 'credit' ? dueDate : undefined
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center animate-fade-in font-sans">
      <div className="absolute inset-0 cursor-default" onClick={onClose}></div>
      <form 
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-slate-900 rounded-t-3xl border-t border-slate-850 p-6 relative z-10 animate-slide-up flex flex-col gap-4.5 safe-padding-bottom"
      >
        <div className="flex justify-between items-center">
          <h3 className="font-display font-extrabold text-base text-white">
            {editingAccount ? 'Editar Cuenta / Tarjeta' : 'Agregar Tarjeta / Caja'}
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white focus:outline-none">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Account Type */}
        <div className="flex flex-col gap-1.5 w-full">
          <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Tipo de Tarjeta o Fondo</label>
          <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-900">
            {(['debit', 'credit', 'savings', 'cash'] as const).map(t => (
              <button 
                key={t}
                type="button" 
                onClick={() => setType(t)}
                className={`py-2 text-[10px] font-bold rounded-lg capitalize transition-all focus:outline-none ${type === t ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
              >
                {t === 'debit' ? 'Débito' : t === 'credit' ? 'Crédito' : t === 'savings' ? 'Ahorro' : 'Efectivo'}
              </button>
            ))}
          </div>
        </div>

        {/* Currency Selector */}
        <div className="flex flex-col gap-1.5 w-full">
          <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Moneda Principal</label>
          <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-900">
            <button 
              type="button" 
              onClick={() => setCurrency('USD')}
              className={`py-2 text-xs font-bold rounded-lg transition-all focus:outline-none ${currency === 'USD' ? 'bg-indigo-650 text-white border border-indigo-500/20' : 'text-slate-400'}`}
            >
              Dólares ($ USD)
            </button>
            <button 
              type="button" 
              onClick={() => setCurrency('VES')}
              className={`py-2 text-xs font-bold rounded-lg transition-all focus:outline-none ${currency === 'VES' ? 'bg-indigo-650 text-white border border-indigo-500/20' : 'text-slate-400'}`}
            >
              Bolívares (Bs. VES)
            </button>
          </div>
        </div>

        {/* Bank & Name */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Institución Bancaria</label>
            <input 
              type="text" 
              placeholder="Ej: BBVA, Banesco"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Nombre del Producto</label>
            <input 
              type="text" 
              placeholder="Ej: Tarjeta de Sueldo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none"
            />
          </div>
        </div>

        {/* Balance & Limit */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Saldo Inicial ({currency})</label>
            <input 
              type="number" 
              step="0.01"
              placeholder="Ej: 1500"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none"
            />
          </div>
          
          {type === 'credit' ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Límite de Crédito ({currency})</label>
              <input 
                type="number" 
                placeholder="Ej: 5000"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                required={type === 'credit'}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Últimos 4 dígitos</label>
              <input 
                type="text" 
                maxLength={4}
                placeholder="Ej: 1234"
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none font-mono"
              />
            </div>
          )}
        </div>

        {/* Credit settings */}
        {type === 'credit' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Día de Factura/Corte</label>
              <input 
                type="number" 
                min="1" 
                max="31"
                placeholder="Ej: 15"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Últimos 4 dígitos</label>
              <input 
                type="text" 
                maxLength={4}
                placeholder="Ej: 9876"
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none font-mono"
              />
            </div>
          </div>
        )}

        {/* Theme/Color Grid Selector */}
        <div className="flex flex-col gap-2 w-full">
          <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Estilo de Color de Tarjeta</label>
          <div className="flex gap-2.5">
            {Object.keys(CARD_THEMES).map(t => {
              const bgPalette: Record<string, string> = {
                indigo: 'bg-indigo-600',
                emerald: 'bg-emerald-600',
                rose: 'bg-rose-600',
                amber: 'bg-amber-500',
                violet: 'bg-violet-600',
                cyan: 'bg-cyan-500',
                dark: 'bg-slate-700'
              };
              return (
                <button 
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`w-7 h-7 rounded-full ${bgPalette[t] || 'bg-slate-500'} border-2 transition-all focus:outline-none ${theme === t ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`}
                ></button>
              );
            })}
          </div>
        </div>

        <button 
          type="submit"
          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 rounded-xl font-bold text-xs text-white shadow-lg active:scale-[0.98] transition-transform mt-2 focus:outline-none"
        >
          {editingAccount ? 'Guardar Cambios' : 'Crear Tarjeta'}
        </button>
      </form>
    </div>
  );
}

// ... (existing code for TransactionModal, AccountModal, DebtModal) ...

// ==========================================
// 3. DEBT CREATION/EDITION MODAL
// ==========================================
interface DebtModalProps {
  editingDebt: Debt | null;
  onClose: () => void;
  onSubmit: (data: {
    type: 'to_pay' | 'to_collect';
    person: string;
    amount: number;
    currency: 'USD' | 'VES';
    dueDate?: string;
    description: string;
  }) => void;
}

export function DebtModal({ editingDebt, onClose, onSubmit }: DebtModalProps) {
  const [type, setType] = useState<'to_pay' | 'to_collect'>(editingDebt?.type || 'to_pay');
  const [person, setPerson] = useState(editingDebt?.person || '');
  const [amount, setAmount] = useState(editingDebt?.amount?.toString() || '');
  const [currency, setCurrency] = useState<'USD' | 'VES'>(editingDebt?.currency || 'USD');
  const [dueDate, setDueDate] = useState(editingDebt?.dueDate || '');
  const [description, setDescription] = useState(editingDebt?.description || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    
    if (!person.trim()) {
      alert('Ingresa el nombre del deudor o contacto.');
      return;
    }
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Por favor introduce un monto correlativo de deuda válido.');
      return;
    }

    onSubmit({
      type,
      person: person.trim(),
      amount: parsedAmount,
      currency,
      dueDate: dueDate || undefined,
      description: description.trim()
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center animate-fade-in font-sans">
      <div className="absolute inset-0 cursor-default" onClick={onClose}></div>
      <form 
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-slate-900 rounded-t-3xl border-t border-slate-850 p-6 relative z-10 animate-slide-up flex flex-col gap-4.5 safe-padding-bottom"
      >
        <div className="flex justify-between items-center">
          <h3 className="font-display font-extrabold text-base text-white">
            {editingDebt ? 'Editar Registro de Deuda' : 'Nuevo Registro de Deuda'}
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white focus:outline-none">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Mode switcher debt/loan */}
        <div className="flex flex-col gap-1.5 w-full">
          <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Flujo de Deuda</label>
          <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-900">
            <button 
              type="button" 
              onClick={() => setType('to_pay')}
              className={`py-2 text-xs font-bold rounded-lg transition-all focus:outline-none ${type === 'to_pay' ? 'bg-rose-500/20 border border-rose-500/35 text-rose-300' : 'text-slate-400'}`}
            >
              Yo Debo (Mis Deudas)
            </button>
            <button 
              type="button" 
              onClick={() => setType('to_collect')}
              className={`py-2 text-xs font-bold rounded-lg transition-all focus:outline-none ${type === 'to_collect' ? 'bg-emerald-500/20 border border-emerald-500/35 text-emerald-300' : 'text-slate-400'}`}
            >
              Me Deben (Cobranzas)
            </button>
          </div>
        </div>

        {/* Contact Name */}
        <div className="flex flex-col gap-1.5 w-full">
          <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Nombre del Contacto</label>
          <input 
            type="text" 
            placeholder="Ej: Carlos Mendoza"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            required
            className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none"
          />
        </div>

        {/* Amount & Currency */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Monto</label>
            <input 
              type="number" 
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Divisa</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'USD' | 'VES')}
              className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none font-medium"
            >
              <option value="USD">Dólares ($)</option>
              <option value="VES">Bolívares (Bs.)</option>
            </select>
          </div>
        </div>

        {/* Due date & description */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Fecha límite de pago</label>
            <input 
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Concepto/Descripción</label>
            <input 
              type="text"
              placeholder="Ej: Préstamo repuestos, Almuerzo"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none"
            />
          </div>
        </div>

        <button 
          type="submit"
          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 rounded-xl font-bold text-xs text-white shadow-lg active:scale-[0.98] transition-transform mt-2 focus:outline-none"
        >
          {editingDebt ? 'Guardar Cambios' : 'Registrar Deuda'}
        </button>
      </form>
    </div>
  );
}

// ==========================================
// 4. PASSWORD CONFIRMATION MODAL
// ==========================================
interface PasswordModalProps {
  onConfirm: (password: string) => void;
  onClose: () => void;
}

export function PasswordConfirmationModal({ onConfirm, onClose }: PasswordModalProps) {
  const [password, setPassword] = useState('');
  
  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(password);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in font-sans">
      <div className="absolute inset-0 cursor-default" onClick={onClose}></div>
      <form 
        onSubmit={handleConfirm}
        className="w-full max-w-xs bg-slate-900 rounded-3xl p-6 relative z-10 animate-slide-up flex flex-col gap-4 shadow-2xl border border-slate-800"
      >
        <h3 className="font-display font-black text-sm text-white text-center">Confirmar Contraseña</h3>
        <p className="text-[10px] text-slate-400 text-center -mt-2">Introduce tu contraseña para confirmar la eliminación.</p>
        <input 
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoFocus
          required
          className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-white text-center focus:outline-none tracking-widest font-mono"
        />
        <div className="grid grid-cols-2 gap-3 mt-1">
          <button type="button" onClick={onClose} className="py-2.5 rounded-xl border border-slate-800 text-xs font-bold text-slate-400">Cancelar</button>
          <button type="submit" className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-lg">Confirmar</button>
        </div>
      </form>
    </div>
  );
}

// ==========================================
// 5. TRANSACTION IMPORT MODAL
// ==========================================
interface TransactionImportModalProps {
  transactions: Omit<Transaction, 'id' | 'accountId'>[];
  accounts: Account[];
  onImport: (transactions: Omit<Transaction, 'id'>[]) => void;
  onClose: () => void;
}

export function TransactionImportModal({ transactions, accounts, onImport, onClose }: TransactionImportModalProps) {
  const [selectedAccount, setSelectedAccount] = useState(accounts[0]?.id || '');
  
  const handleImport = () => {
    const finalTransactions = transactions.map(t => ({
      ...t,
      accountId: selectedAccount,
    }));
    onImport(finalTransactions);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in font-sans">
      <div className="w-full max-w-lg bg-slate-900 rounded-3xl p-6 relative z-10 animate-slide-up shadow-2xl border border-slate-800">
        <h3 className="font-display font-black text-lg text-white mb-4">Importar Movimientos</h3>
        <p className="text-sm text-slate-400 mb-4">Se encontraron {transactions.length} movimientos. Selecciona la cuenta donde importarlos:</p>
        
        <select 
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 mb-6"
        >
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>{acc.name}</option>
          ))}
        </select>
        
        <div className="max-h-60 overflow-y-auto mb-6 custom-scroll">
          {transactions.map((t, i) => (
            <div key={i} className="flex justify-between items-center text-xs py-2 border-b border-slate-800">
              <span className="text-slate-200">{t.description}</span>
              <span className={t.type === 'expense' ? 'text-rose-400' : 'text-emerald-400'}>
                {t.type === 'expense' ? '-' : '+'}{t.amount}
              </span>
            </div>
          ))}
        </div>
        
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-800 text-xs font-bold text-slate-400">Cancelar</button>
          <button onClick={handleImport} className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs">Importar</button>
        </div>
      </div>
    </div>
  );
}
