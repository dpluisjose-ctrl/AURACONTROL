import React, { useMemo } from 'react';
import { Account, Transaction, CATEGORIES, CARD_THEMES, formatCurrencyVal } from '../types';
import Icon from './Icon';

interface DashboardViewProps {
  totals: {
    netWorth: number;
    totalSavings: number;
    totalDebt: number;
    availableCash: number;
  };
  accounts: Account[];
  transactions: Transaction[];
  displayCurrency: string;
  setDisplayCurrency: (val: 'USD' | 'VES') => void;
  onSelectAccount: (acc: Account | null) => void;
  exchangeRate: number;
  bcvRate: number;
}

export default function DashboardView({
  totals,
  accounts,
  transactions,
  displayCurrency,
  setDisplayCurrency,
  onSelectAccount,
  exchangeRate,
  bcvRate
}: DashboardViewProps) {
  
  const recentTransactions = useMemo(() => transactions.slice(0, 5), [transactions]);

  // Categorise accounts by currency
  const usdAccounts = useMemo(() => accounts.filter(a => a.currency === 'USD'), [accounts]);
  const vesAccounts = useMemo(() => accounts.filter(a => a.currency === 'VES'), [accounts]);

  // Calculate sub-totals in their home currency
  const totalUsd = useMemo(() => usdAccounts.reduce((acc, curr) => acc + curr.balance, 0), [usdAccounts]);
  const totalVes = useMemo(() => vesAccounts.reduce((acc, curr) => acc + curr.balance, 0), [vesAccounts]);

  return (
    <div className="p-5 flex flex-col gap-6 animate-fade-in font-sans">
      
      {/* NET WORTH HEADER WITH DUAL CURRENCY BREAKDOWN */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950/90 via-slate-900 to-indigo-900/40 p-6 border border-indigo-500/25 glow-indigo">
        <div className="absolute right-0 top-0 -mt-8 -mr-8 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>
        
        {/* DOLAR CONFIGURATION FLUX & HEADER */}
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-300">Cuentas en Dólares ($)</span>
          <div className="flex bg-slate-950/80 border border-slate-800 rounded-lg p-0.5 text-[9px] font-bold">
            <button 
              onClick={() => setDisplayCurrency('USD')}
              className={`px-2 py-0.5 rounded-md transition-all ${displayCurrency === 'USD' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
            >
              Consolidar $
            </button>
            <button 
              onClick={() => setDisplayCurrency('VES')}
              className={`px-2 py-0.5 rounded-md transition-all ${displayCurrency === 'VES' ? 'bg-indigo-650 text-white' : 'text-slate-400'}`}
            >
              Consolidar Bs
            </button>
          </div>
        </div>

        {/* DOLAR TOTAL */}
        <div className="text-3xl font-display font-black text-white tracking-tight leading-none mt-1">
          {formatCurrencyVal(totalUsd, 'USD')}
        </div>
        
        {/* Dollar Accounts Details */}
        <div className="flex flex-col gap-2 mt-4 pl-3 border-l border-indigo-500/35">
          {usdAccounts.length === 0 ? (
            <div className="text-[10px] text-slate-500 italic">No tienes cuentas registradas en dólares.</div>
          ) : (
            usdAccounts.map(acc => (
              <div 
                key={acc.id} 
                onClick={() => onSelectAccount(acc)}
                className="flex justify-between text-xs text-slate-350 cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 opacity-80"></span>
                  <span>{acc.name}</span>
                </div>
                <span className="font-mono text-slate-200 font-bold">{formatCurrencyVal(acc.balance, 'USD')}</span>
              </div>
            ))
          )}
        </div>

        {/* SEPARATOR */}
        <div className="my-5 border-t border-slate-800/40"></div>

        {/* BOLIVARES SECTION */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400">Bolívares (Bs. VES)</span>
          <div className="text-3xl font-display font-black text-white tracking-tight leading-none mt-1.5">
            {formatCurrencyVal(totalVes, 'VES')}
          </div>
          
          {/* Bolívares Accounts Details */}
          <div className="flex flex-col gap-2 mt-4 pl-3 border-l border-emerald-500/35">
            {vesAccounts.length === 0 ? (
              <div className="text-[10px] text-slate-500 italic">No tienes cuentas registradas en bolívares.</div>
            ) : (
              vesAccounts.map(acc => (
                <div 
                  key={acc.id} 
                  onClick={() => onSelectAccount(acc)}
                  className="flex justify-between text-xs text-slate-350 cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 opacity-80"></span>
                    <span>{acc.name}</span>
                  </div>
                  <span className="font-mono text-slate-200 font-bold">{formatCurrencyVal(acc.balance, 'VES')}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* CONSOLIDATED BALANCE BOX (FOOTER) */}
        <div className="mt-5 p-3 rounded-2xl bg-slate-950/70 border border-indigo-500/10 flex justify-between items-center text-xs">
          <span className="text-slate-400 font-medium font-display">Patrimonio Neto Consolidado ({displayCurrency}):</span>
          <span className="font-extrabold font-display text-indigo-300 text-sm">
            {formatCurrencyVal(totals.netWorth, displayCurrency)}
          </span>
        </div>

        {/* BOLIVARES BALANCE IN USD BY BCV RATE */}
        <div className="mt-2.5 p-3 rounded-2xl bg-slate-950/75 border border-emerald-500/20 flex justify-between items-center text-xs shadow-sm hover:border-emerald-500/35 transition-colors">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center border border-emerald-500/10">
              <Icon name="landmark" className="w-3 h-3 text-emerald-400" />
            </div>
            <span className="text-slate-400 font-medium font-display">
              Saldo en Bs. a $ (Tasa Oficial BCV: <span className="font-mono text-[10px] text-emerald-400 font-bold">{formatCurrencyVal(bcvRate, 'VES')}</span>):
            </span>
          </div>
          <span className="font-black font-display text-emerald-400 text-sm">
            {formatCurrencyVal(bcvRate > 0 ? totalVes / bcvRate : 0, 'USD')}
          </span>
        </div>

        {/* BOLIVARES BALANCE IN USD BY MANUAL RATE */}
        <div className="mt-2 p-3 rounded-2xl bg-slate-950/75 border border-amber-500/20 flex justify-between items-center text-xs shadow-sm hover:border-amber-500/35 transition-colors">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-amber-500/10 flex items-center justify-center border border-amber-500/10">
              <Icon name="sliders" className="w-3 h-3 text-amber-400" />
            </div>
            <span className="text-slate-400 font-medium font-display">
              Saldo en Bs. a $ (Tasa Manual Fija: <span className="font-mono text-[10px] text-amber-400 font-bold">{formatCurrencyVal(exchangeRate, 'VES')}</span>):
            </span>
          </div>
          <span className="font-black font-display text-amber-400 text-sm">
            {formatCurrencyVal(exchangeRate > 0 ? totalVes / exchangeRate : 0, 'USD')}
          </span>
        </div>
        
      </div>

      {/* QUICK STATUS TICKERS */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900/35 border border-slate-900/70 rounded-2xl p-3 flex flex-col gap-1">
          <span className="text-[9px] uppercase font-bold text-slate-400">Fondo Líquido ({displayCurrency})</span>
          <span className="text-sm font-display font-extrabold text-emerald-400">{formatCurrencyVal(totals.availableCash, displayCurrency)}</span>
        </div>
        <div className="bg-slate-900/35 border border-slate-900/70 rounded-2xl p-3 flex flex-col gap-1">
          <span className="text-[9px] uppercase font-bold text-slate-400">Crédito Consumido ({displayCurrency})</span>
          <span className="text-sm font-display font-extrabold text-rose-400">{formatCurrencyVal(totals.totalDebt, displayCurrency)}</span>
        </div>
      </div>

      {/* ACCOUNTS HORIZONTAL SLIDER */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-display font-bold text-sm text-slate-200">Tarjetas de Pago & Cuentas</h2>
          <button 
            type="button"
            onClick={() => onSelectAccount(null)}
            className="text-xs text-indigo-400 font-semibold focus:outline-none"
          >
            Ver todas &rarr;
          </button>
        </div>
        
        <div className="flex gap-4 overflow-x-auto custom-scroll pb-2 -mx-5 px-5 snap-x">
          {accounts.map(acc => {
            const themeClass = CARD_THEMES[acc.theme] || CARD_THEMES.dark;
            const isCredit = acc.type === 'credit';
            return (
              <div 
                key={acc.id}
                onClick={() => onSelectAccount(acc)}
                className={`snap-center flex-shrink-0 w-64 rounded-2xl p-5 bg-gradient-to-br border flex flex-col justify-between h-40 cursor-pointer transform active:scale-[0.98] transition-transform ${themeClass}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] uppercase font-bold tracking-widest opacity-80">
                      {acc.type === 'credit' ? 'Crédito' : acc.type === 'savings' ? 'Ahorros' : acc.type === 'cash' ? 'Efectivo' : 'Débito'} • {acc.currency}
                    </span>
                    <h3 className="font-display font-bold text-sm tracking-tight mt-0.5 text-white line-clamp-1">{acc.name}</h3>
                  </div>
                  <div className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/10 border border-white/5 text-white uppercase">{acc.bank}</div>
                </div>

                <div>
                  {isCredit && (
                    <div className="w-full bg-white/10 rounded-full h-1.5 mb-2.5 overflow-hidden">
                      <div 
                        className="bg-white h-full rounded-full" 
                        style={{ width: `${Math.min(100, (Math.abs(acc.balance) / acc.limit) * 100)}%` }}
                      ></div>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[9px] opacity-75 font-medium">Balance disponible</p>
                      <p className="text-lg font-display font-extrabold leading-none text-white mt-0.5">
                        {formatCurrencyVal(acc.balance, acc.currency)}
                      </p>
                    </div>
                    <p className="font-mono text-xs opacity-75">•••• {acc.number}</p>
                  </div>
                </div>
              </div>
            );
          })}
          
          <div 
            onClick={() => onSelectAccount(null)}
            className="snap-center flex-shrink-0 w-36 rounded-2xl p-4 border border-dashed border-slate-800 bg-slate-900/10 flex flex-col items-center justify-center text-slate-500 active:bg-slate-900/30 cursor-pointer h-40 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-slate-900/80 flex items-center justify-center mb-2 border border-slate-800">
              <Icon name="plus" className="w-5 h-5 text-slate-400" />
            </div>
            <span className="text-xs font-semibold text-slate-450">Gestionar</span>
          </div>
        </div>
      </div>

      {/* QUICK CURRENCY STATS */}
      <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-550/15">
            <Icon name="refresh-cw" className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-200">Tasa de Cambio Oficial</p>
            <p className="text-[10px] text-slate-400 font-mono">1 USD = {formatCurrencyVal(exchangeRate, 'VES')}</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-extrabold text-indigo-400 bg-indigo-950 border border-indigo-900/40 px-2.5 py-1 rounded-full uppercase">
            Establecida
          </span>
        </div>
      </div>

      {/* RECENT ACTIVITY */}
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <h2 className="font-display font-bold text-sm text-slate-200">Actividad Reciente</h2>
          <button 
            type="button"
            onClick={() => onSelectAccount(null)}
            className="text-xs text-indigo-400 font-semibold focus:outline-none"
          >
            Ver Historial
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {recentTransactions.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs bg-slate-900/20 rounded-2xl border border-slate-900 border-dashed">
              No hay transacciones registradas.
            </div>
          ) : (
            recentTransactions.map(trans => {
              const cat = CATEGORIES[trans.category] || CATEGORIES.other;
              const isExpense = trans.type === 'expense';
              const account = accounts.find(a => a.id === trans.accountId);
              return (
                <div key={trans.id} className="bg-slate-900/20 border border-slate-900/70 rounded-2xl p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cat.color}`}>
                      <Icon name={cat.icon} className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-slate-100 line-clamp-1">{trans.description}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-slate-500 font-medium font-mono">{trans.date}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-800"></span>
                        <span className="text-[9px] text-slate-400 font-bold bg-slate-800/60 px-1.5 py-0.2 rounded uppercase">{account?.name || 'Cuenta'}</span>
                      </div>
                    </div>
                  </div>
                  <div className={`text-xs font-bold font-display ${trans.category === 'exchange' ? 'text-indigo-400' : isExpense ? 'text-rose-400' : 'text-emerald-450'}`}>
                    {trans.category === 'exchange' ? '' : isExpense ? '-' : '+'}{formatCurrencyVal(trans.amount, account?.currency)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
