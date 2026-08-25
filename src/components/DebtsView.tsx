import React, { useState, useMemo } from 'react';
import { Debt, Account, formatCurrencyVal } from '../types';
import Icon from './Icon';

interface DebtsViewProps {
  debts: Debt[];
  accounts: Account[];
  onAddDebt: () => void;
  onEditDebt: (debt: Debt) => void;
  onDeleteDebt: (id: string) => void;
  onMarkAsPaid: (debtId: string, accountId: string | null) => void;
  formatCurrencyVal: (val: number, currency?: string) => string;
  exchangeRate: number;
}

export default function DebtsView({
  debts,
  accounts,
  onAddDebt,
  onEditDebt,
  onDeleteDebt,
  onMarkAsPaid,
  formatCurrencyVal,
  exchangeRate
}: DebtsViewProps) {
  
  const [activeMode, setActiveMode] = useState<'to_pay' | 'to_collect'>('to_pay');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showPaid, setShowPaid] = useState(true);
  const [settlingDebt, setSettlingDebt] = useState<Debt | null>(null);
  const [debtToDelete, setDebtToDelete] = useState<Debt | null>(null);

  // Filter debts by type and status
  const filteredDebts = useMemo(() => {
    return debts.filter(d => d.type === activeMode && (showPaid ? true : d.status === 'pending'));
  }, [debts, activeMode, showPaid]);

  // Compute pending summary totals in their original currencies
  const totals = useMemo(() => {
    let usd = 0;
    let ves = 0;
    debts.forEach(d => {
      if (d.type === activeMode && d.status === 'pending') {
        if (d.currency === 'USD') usd += d.amount;
        else ves += d.amount;
      }
    });
    return { usd, ves };
  }, [debts, activeMode]);

  return (
    <div className="p-5 flex flex-col gap-6 animate-fade-in font-sans">
      
      {/* MODE SELECTOR HEADER */}
      <div className="flex justify-between items-center relative">
        <div className="relative">
          <button 
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 border border-slate-850 rounded-xl text-xs font-bold text-white active:scale-95 transition-all focus:outline-none"
          >
            <span>{activeMode === 'to_pay' ? 'Mis Deudas (Yo Debo)' : 'Deudores (Me Deben)'}</span>
            <Icon name="chevron-down" className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {isDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
              <div className="absolute left-0 mt-2 w-52 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden py-1 animate-fade-in">
                <button
                  type="button"
                  onClick={() => { setActiveMode('to_pay'); setIsDropdownOpen(false); }}
                  className={`w-full px-4 py-2.5 text-left text-xs font-bold flex items-center justify-between focus:outline-none ${activeMode === 'to_pay' ? 'bg-indigo-650 text-white' : 'text-slate-450 hover:bg-slate-850 hover:text-slate-250'}`}
                >
                  <span>Mis Deudas (Yo Debo)</span>
                  {activeMode === 'to_pay' && <Icon name="check" className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveMode('to_collect'); setIsDropdownOpen(false); }}
                  className={`w-full px-4 py-2.5 text-left text-xs font-bold flex items-center justify-between focus:outline-none ${activeMode === 'to_collect' ? 'bg-indigo-650 text-white' : 'text-slate-450 hover:bg-slate-850 hover:text-slate-250'}`}
                >
                  <span>Deudores (Me Deben)</span>
                  {activeMode === 'to_collect' && <Icon name="check" className="w-3.5 h-3.5" />}
                </button>
              </div>
            </>
          )}
        </div>

        <button 
          type="button"
          onClick={onAddDebt}
          className="w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/35 text-indigo-400 flex items-center justify-center active:scale-95 transition-transform focus:outline-none"
        >
          <Icon name="plus" className="w-5 h-5" />
        </button>
      </div>

      {/* CONSOLIDATED BADGES CARD */}
      <div className="rounded-2xl p-4.5 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-900/80 flex flex-col gap-3.5">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Balance Consolidado Pendiente</span>
        <div className="grid grid-cols-2 gap-4 divide-x divide-slate-850">
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-medium text-slate-500">En Dólares</span>
            <span className={`text-xl font-display font-black leading-none mt-1 ${activeMode === 'to_pay' ? 'text-rose-450' : 'text-emerald-450'}`}>
              {formatCurrencyVal(totals.usd, 'USD')}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 pl-4">
            <span className="text-[9px] font-medium text-slate-500">En Bolívares</span>
            <span className={`text-xl font-display font-black leading-none mt-1 ${activeMode === 'to_pay' ? 'text-rose-450' : 'text-emerald-450'}`}>
              {formatCurrencyVal(totals.ves, 'VES')}
            </span>
          </div>
        </div>
      </div>

      {/* PAID TOGGLES */}
      <div className="flex justify-between items-center px-1">
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Registros</span>
        <button 
          type="button"
          onClick={() => setShowPaid(!showPaid)}
          className="flex items-center gap-1.5 text-[10px] text-indigo-400 font-bold focus:outline-none hover:text-indigo-300"
        >
          <Icon name={showPaid ? "eye-off" : "eye"} className="w-3.5 h-3.5" />
          <span>{showPaid ? 'Ocultar pagados' : 'Mostrar pagados'}</span>
        </button>
      </div>

      {/* LIST LAYOUT */}
      <div className="flex flex-col gap-3 pb-8">
        {filteredDebts.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs bg-slate-900/10 rounded-2xl border border-slate-900 border-dashed">
            {activeMode === 'to_pay' 
              ? 'No tienes deudas pendientes en esta sección.' 
              : 'No hay deudores en esta sección.'}
          </div>
        ) : (
          filteredDebts.map(debt => (
            <DebtRow 
              key={debt.id}
              debt={debt}
              onEdit={onEditDebt}
              onDelete={() => setDebtToDelete(debt)}
              onSettleClick={(d) => setSettlingDebt(d)}
              formatCurrencyVal={formatCurrencyVal}
            />
          ))
        )}
      </div>

      {/* SETTLE DEBT MODAL TRIGGER */}
      {settlingDebt && (
        <SettleDebtModal 
          debt={settlingDebt}
          accounts={accounts}
          onClose={() => setSettlingDebt(null)}
          onSettle={(debtId, accountId) => {
            onMarkAsPaid(debtId, accountId);
            setSettlingDebt(null);
          }}
          formatCurrencyVal={formatCurrencyVal}
          exchangeRate={exchangeRate}
        />
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {debtToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-55 flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0" onClick={() => setDebtToDelete(null)}></div>
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 relative z-10 animate-slide-up flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                <Icon name="alert-triangle" className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h3 className="font-display font-bold text-sm text-white">¿Eliminar registro?</h3>
                <p className="text-[10px] text-slate-400">Esta acción no se puede revertir.</p>
              </div>
            </div>
            
            <p className="text-[11px] text-slate-300 leading-relaxed bg-slate-950/40 p-3 rounded-xl border border-slate-850">
              ¿Seguro de que deseas eliminar el registro de deuda con <strong className="text-white">{debtToDelete.person}</strong> por un monto de <strong className="text-white">{formatCurrencyVal(debtToDelete.amount, debtToDelete.currency)}</strong>?
            </p>
            
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => setDebtToDelete(null)}
                className="py-2.5 bg-slate-850 hover:bg-slate-800 border border-slate-800 rounded-xl font-bold text-xs text-slate-300 active:scale-95 transition-all focus:outline-none"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteDebt(debtToDelete.id);
                  setDebtToDelete(null);
                }}
                className="py-2.5 bg-rose-600 hover:bg-rose-700 rounded-xl font-bold text-xs text-white shadow-lg active:scale-95 transition-all focus:outline-none"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Name Initials Helper
const getInitials = (name: string) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
};

interface DebtRowProps {
  key?: any;
  debt: Debt;
  onEdit: (debt: Debt) => void;
  onDelete: (id: string) => void;
  onSettleClick: (debt: Debt) => void;
  formatCurrencyVal: (val: number, currency?: string) => string;
}

function DebtRow({ 
  debt, 
  onEdit, 
  onDelete, 
  onSettleClick, 
  formatCurrencyVal 
}: DebtRowProps) {
  const isPaid = debt.status === 'paid';
  const isToPay = debt.type === 'to_pay';
  
  const daysInfo = useMemo(() => {
    if (!debt.dueDate || isPaid) return null;
    const due = new Date(debt.dueDate);
    const today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return { text: `Vencido hace ${Math.abs(diffDays)} d`, color: 'text-rose-450 bg-rose-950/25 border-rose-900/30' };
    } else if (diffDays === 0) {
      return { text: 'Vence hoy', color: 'text-amber-500 bg-amber-950/20 border-amber-900/30' };
    } else if (diffDays === 1) {
      return { text: 'Vence mañana', color: 'text-amber-400 bg-amber-950/15 border-amber-900/20' };
    } else {
      return { text: `Vence en ${diffDays} d`, color: 'text-slate-400 bg-slate-900/50 border-slate-800' };
    }
  }, [debt.dueDate, isPaid]);

  const initials = getInitials(debt.person);
  
  // Custom Dynamic Color Gradients based on string length and hashing
  const avatarGradient = useMemo(() => {
    const charCode = initials.charCodeAt(0) + (initials.charCodeAt(1) || 0);
    const gradients = [
      'from-indigo-500 to-violet-600',
      'from-emerald-500 to-teal-600',
      'from-rose-500 to-pink-600',
      'from-amber-500 to-orange-650',
      'from-cyan-500 to-blue-650',
      'from-purple-500 to-violet-700'
    ];
    return gradients[charCode % gradients.length];
  }, [initials]);

  return (
    <div className={`bg-slate-900/20 border border-slate-900/70 rounded-2xl p-4 flex items-center justify-between transition-all ${isPaid ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full bg-gradient-to-tr ${avatarGradient} flex items-center justify-center text-xs font-black text-white shadow-md border border-white/5`}>
          {initials}
        </div>
        
        <div>
          <div className="flex items-center gap-2">
            <h4 className={`text-xs font-bold text-slate-100 ${isPaid ? 'line-through' : ''}`}>{debt.person}</h4>
            {isPaid && (
              <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-slate-850 text-slate-450 border border-slate-800/10">
                Pagado
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-450 line-clamp-1 mt-0.5">{debt.description || 'Sin concepto'}</p>
          
          {daysInfo && (
            <span className={`inline-block text-[8px] font-bold px-1.5 py-0.5 rounded border mt-1.5 ${daysInfo.color}`}>
              {daysInfo.text}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className={`text-xs font-bold font-display ${isPaid ? 'text-slate-500 line-through' : isToPay ? 'text-rose-400' : 'text-emerald-450'}`}>
            {isToPay ? '-' : '+'}{formatCurrencyVal(debt.amount, debt.currency)}
          </div>
          {debt.dueDate && !isPaid && (
            <p className="text-[8px] text-slate-550 font-mono mt-0.5">{debt.dueDate}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {!isPaid && (
            <button 
              type="button"
              onClick={() => onSettleClick(debt)}
              className="p-1.5 bg-emerald-600/15 border border-emerald-500/25 text-emerald-400 rounded-lg active:scale-90 transition-transform focus:outline-none hover:bg-emerald-650/25"
              title="Liquidar deuda"
            >
              <Icon name="check" className="w-3.5 h-3.5" />
            </button>
          )}
          <button 
            type="button"
            onClick={() => onEdit(debt)}
            className="p-1.5 bg-slate-900 border border-slate-850 text-slate-450 hover:text-indigo-400 rounded-lg active:scale-90 transition-transform focus:outline-none"
            title="Editar deuda"
          >
            <Icon name="edit" className="w-3.5 h-3.5" />
          </button>
          <button 
            type="button"
            onClick={() => onDelete(debt.id)}
            className="p-1.5 bg-rose-950/20 border border-rose-900/30 text-rose-455 rounded-lg active:scale-90 transition-transform focus:outline-none hover:bg-rose-950/30"
            title="Eliminar"
          >
            <Icon name="trash-2" className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// LOCAL INTERNAL MODAL FOR LIQUIDATING THE DEBT WITH OPTIONAL ACCOUNT ASSOCIATION
function SettleDebtModal({ 
  debt, 
  accounts, 
  onClose, 
  onSettle,
  formatCurrencyVal,
  exchangeRate
}: { 
  debt: Debt; 
  accounts: Account[]; 
  onClose: () => void; 
  onSettle: (debtId: string, accountId: string | null) => void;
  formatCurrencyVal: (val: number, currency?: string) => string;
  exchangeRate: number;
}) {
  const [selectedAccountId, setSelectedAccountId] = useState('');

  const overdrawWarn = useMemo(() => {
    if (!selectedAccountId || debt.type !== 'to_pay') return null;
    const account = accounts.find(a => a.id === selectedAccountId);
    if (!account || account.type === 'credit') return null;

    let transAmount = debt.amount;
    if (account.currency !== debt.currency) {
      if (account.currency === 'USD') {
        transAmount = debt.amount / exchangeRate;
      } else {
        transAmount = debt.amount * exchangeRate;
      }
    }

    if (account.balance < transAmount) {
      return {
        balanceStr: formatCurrencyVal(account.balance, account.currency),
        requiredStr: formatCurrencyVal(transAmount, account.currency)
      };
    }
    return null;
  }, [selectedAccountId, debt, accounts, exchangeRate, formatCurrencyVal]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSettle(debt.id, selectedAccountId || null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in font-sans">
      <div className="absolute inset-0" onClick={onClose}></div>
      <form 
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800 p-6 relative z-10 animate-slide-up flex flex-col gap-4 max-h-[90vh] overflow-y-auto custom-scroll"
      >
        <div className="flex justify-between items-center">
          <h3 className="font-display font-extrabold text-base text-white">Liquidar Deuda</h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white focus:outline-none">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850">
          <div className="text-[9px] text-slate-500 uppercase font-black">Resumen de Cuenta Pendiente</div>
          <div className="flex justify-between items-center mt-1">
            <div>
              <div className="text-xs font-bold text-slate-200">{debt.person}</div>
              <div className="text-[10px] text-slate-450 mt-0.5">{debt.description || 'Sin descripción'}</div>
            </div>
            <div className={`text-sm font-extrabold ${debt.type === 'to_pay' ? 'text-rose-450' : 'text-emerald-450'}`}>
              {debt.type === 'to_pay' ? '-' : '+'}{formatCurrencyVal(debt.amount, debt.currency)}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">¿Vincular saldo con una Cuenta?</label>
          <p className="text-[10px] text-slate-500 leading-normal mb-1">
            {debt.type === 'to_pay' 
              ? 'Esto descontará automáticamente el monto correlativo de la cuenta que marques.' 
              : 'Esto sumará el flujo de cobro ingresado en tu cuenta física o bancaria.'}
          </p>
          <select 
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none"
          >
            <option value="">No vincular (Solo marcar como pagada fuera de cuentas)</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({formatCurrencyVal(acc.balance, acc.currency)})
              </option>
            ))}
          </select>
          {overdrawWarn && (
            <div className="mt-2.5 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 flex gap-2 items-start text-orange-400 animate-fade-in">
              <Icon name="alert-triangle" className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-[10px] leading-relaxed">
                <span className="font-extrabold block">Advertencia de Sobregiro</span>
                El saldo de la cuenta ({overdrawWarn.balanceStr}) es menor al monto a pagar ({overdrawWarn.requiredStr}). Esta cuenta quedará en saldo negativo al liquidar.
              </div>
            </div>
          )}
        </div>

        <button 
          type="submit"
          className="w-full py-3 bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-700 hover:to-indigo-700 rounded-xl font-bold text-xs text-white shadow-lg active:scale-95 transition-all focus:outline-none mt-1"
        >
          Confirmar Liquidación
        </button>
      </form>
    </div>
  );
}
