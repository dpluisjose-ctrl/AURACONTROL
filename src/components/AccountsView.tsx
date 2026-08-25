import React, { useMemo, useState } from 'react';
import { Account, Transaction, CATEGORIES, CARD_THEMES, formatCurrencyVal } from '../types';
import Icon from './Icon';

export interface PastSaving {
  id: string;
  month: string;
  amountUSD: number;
  amountVES: number;
  date: string;
}

interface AccountsViewProps {
  accounts: Account[];
  transactions: Transaction[];
  selectedAccount: Account | null;
  onSelectAccount: (acc: Account | null) => void;
  onAddAccount: () => void;
  onEditAccount: (acc: Account) => void;
  onDeleteAccount: (id: string) => void;
  pastSavings: PastSaving[];
}

export default function AccountsView({
  accounts,
  transactions,
  selectedAccount,
  onSelectAccount,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  pastSavings = []
}: AccountsViewProps) {
  const [isPastSavingsOpen, setIsPastSavingsOpen] = useState(false);
  
  const accountTransactions = useMemo(() => {
    if (!selectedAccount) return [];
    return transactions.filter(t => t.accountId === selectedAccount.id || t.destinationAccountId === selectedAccount.id);
  }, [selectedAccount, transactions]);

  return (
    <div className="p-5 flex flex-col gap-6 animate-fade-in font-sans">
      {selectedAccount ? (
        /* DETAIL VIEW OF SELECTED ACCOUNT */
        <div className="flex flex-col gap-5">
          {/* Back Button */}
          <button 
            type="button"
            onClick={() => onSelectAccount(null)}
            className="flex items-center gap-1.5 text-xs text-indigo-400 font-bold active:scale-95 transition-transform self-start focus:outline-none"
          >
            <Icon name="arrow-left" className="w-4 h-4" />
            <span>Volver a cuentas</span>
          </button>

          {/* Styled Interactive Digital Card */}
          <div className={`rounded-3xl p-6 bg-gradient-to-br border flex flex-col justify-between h-48 relative overflow-hidden ${CARD_THEMES[selectedAccount.theme] || CARD_THEMES.dark}`}>
            <div className="absolute right-0 top-0 -mt-4 -mr-4 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest opacity-85">
                  {selectedAccount.type === 'credit' ? 'Línea de Crédito' : selectedAccount.type === 'savings' ? 'Plan de Ahorros' : selectedAccount.type === 'cash' ? 'Bolsillo / Efectivo' : 'Cuenta de Débito'} ({selectedAccount.currency})
                </span>
                <h3 className="font-display font-extrabold text-xl tracking-tight text-white mt-1 line-clamp-1">{selectedAccount.name}</h3>
              </div>
              <div className="text-xs font-extrabold px-3 py-1 rounded-lg bg-white/10 border border-white/5 text-white uppercase">{selectedAccount.bank}</div>
            </div>

            <div>
              {selectedAccount.type === 'credit' && (
                <div className="mb-3.5">
                  <div className="flex justify-between text-[10px] mb-1 font-semibold opacity-90">
                    <span>Límite Utilizado</span>
                    <span>{formatCurrencyVal(Math.abs(selectedAccount.balance), selectedAccount.currency)} / {formatCurrencyVal(selectedAccount.limit, selectedAccount.currency)}</span>
                  </div>
                  <div className="w-full bg-white/15 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-white h-full rounded-full" 
                      style={{ width: `${Math.min(100, (Math.abs(selectedAccount.balance) / selectedAccount.limit) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] opacity-80 font-medium">Saldo Disponible</p>
                  <p className="text-2xl font-display font-black text-white leading-none mt-0.5">
                    {formatCurrencyVal(selectedAccount.balance, selectedAccount.currency)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs text-white opacity-85">•••• {selectedAccount.number}</p>
                  {selectedAccount.dueDate && <p className="text-[9px] opacity-75 mt-1">Pago: Día {selectedAccount.dueDate}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons for Account */}
          <div className="grid grid-cols-2 gap-3">
            <button 
              type="button"
              onClick={() => onEditAccount(selectedAccount)}
              className="py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs font-bold text-slate-200 flex items-center justify-center gap-2 active:bg-slate-800/80 transition-colors focus:outline-none"
            >
              <Icon name="edit" className="w-4 h-4 text-indigo-400" />
              <span>Editar Cuenta</span>
            </button>
            <button 
              type="button"
              onClick={() => onDeleteAccount(selectedAccount.id)}
              className="py-3 px-4 rounded-2xl bg-rose-950/20 border border-rose-900/30 text-xs font-bold text-rose-450 flex items-center justify-center gap-2 active:bg-rose-950/40 transition-colors focus:outline-none"
            >
              <Icon name="trash-2" className="w-4 h-4 text-rose-500" />
              <span>Eliminar Cuenta</span>
            </button>
          </div>

          {/* Account History */}
          <div className="flex flex-col gap-3">
            <h3 className="font-display font-bold text-sm text-slate-200">Movimientos de la cuenta</h3>
            <div className="flex flex-col gap-3">
              {accountTransactions.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-xs bg-slate-900/10 rounded-2xl border border-slate-900 border-dashed">
                  No hay transacciones asociadas a esta cuenta.
                </div>
              ) : (
                accountTransactions.map(trans => {
                  const cat = CATEGORIES[trans.category] || CATEGORIES.other;
                  const isExpense = trans.type === 'expense' || (trans.type === 'transfer' && trans.accountId === selectedAccount.id);
                  return (
                    <div key={trans.id} className="bg-slate-900/20 border border-slate-900/70 rounded-2xl p-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cat.color}`}>
                          <Icon name={cat.icon} className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-slate-100 line-clamp-1">{trans.description}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-slate-550 font-mono">{trans.date}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-800"></span>
                            <span className="text-[9px] text-slate-400 font-extrabold uppercase bg-slate-850 px-1.5 py-0.2 rounded border border-slate-800/60">{trans.type === 'transfer' ? 'préstamo' : trans.type}</span>
                          </div>
                        </div>
                      </div>
                      <div className={`text-xs font-bold font-display ${isExpense ? 'text-rose-400' : 'text-emerald-450'}`}>
                        {isExpense ? '-' : '+'}{formatCurrencyVal(trans.amount, selectedAccount.currency)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ALL ACCOUNTS GRID/LIST VIEW */
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-display font-extrabold text-xl text-white">Mis Cuentas</h2>
              <p className="text-[11px] text-slate-400">Administra tus tarjetas, efectivo y planes de ahorro</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPastSavingsOpen(true)}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-750 text-xs font-bold text-indigo-400 flex items-center gap-2 active:scale-95 transition-all focus:outline-none cursor-pointer"
                title="Ahorros de Meses Pasados"
              >
                <Icon name="archive" className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Ahorro meses pasados</span>
                <span className="sm:hidden">Meses pasados</span>
                {pastSavings.length > 0 && (
                  <span className="bg-indigo-600 text-white text-[9px] font-black h-4 px-1.5 rounded-full flex items-center justify-center leading-none">
                    {pastSavings.length}
                  </span>
                )}
              </button>

              <button 
                type="button"
                onClick={onAddAccount}
                className="w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center active:scale-95 transition-transform focus:outline-none"
              >
                <Icon name="plus" className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 mt-2">
            {accounts.map(acc => {
              const isCredit = acc.type === 'credit';
              return (
                <div 
                  key={acc.id}
                  onClick={() => onSelectAccount(acc)}
                  className="bg-slate-900/20 border border-slate-900 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-slate-900/40 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {/* Digital Card Mini Icon Theme */}
                    <div className={`w-12 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center border border-white/10 ${CARD_THEMES[acc.theme]}`}>
                      <span className="font-mono text-[8px] font-bold text-white">••••</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-200">{acc.name}</h4>
                      <p className="text-[10px] text-slate-450 uppercase tracking-widest font-bold mt-0.5">
                        {acc.bank} • {acc.type === 'credit' ? 'Crédito' : acc.type === 'savings' ? 'Ahorros' : acc.type === 'cash' ? 'Efectivo' : 'Débito'} • {acc.currency}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-bold font-display text-white">{formatCurrencyVal(acc.balance, acc.currency)}</p>
                    {isCredit && (
                      <p className="text-[9px] text-slate-500 mt-0.5 font-mono">Límit: {formatCurrencyVal(acc.limit, acc.currency)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PAST SAVINGS MONTHLY LOG MODAL */}
      {isPastSavingsOpen && (
        <div id="past-savings-history-modal" className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="absolute inset-0" onClick={() => setIsPastSavingsOpen(false)}></div>
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 relative z-10 animate-slide-up flex flex-col gap-4 max-h-[85vh] overflow-y-auto custom-scroll shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="archive" className="w-5 h-5 text-indigo-400" />
                <h3 className="font-display font-black text-sm text-white uppercase tracking-wider">Ahorro Meses Pasados</h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsPastSavingsOpen(false)}
                className="p-1 px-2 hover:bg-slate-850 text-slate-500 hover:text-white rounded-lg transition-all focus:outline-none cursor-pointer font-bold text-sm"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed -mt-1 bg-slate-950/45 p-3 rounded-xl border border-slate-850/50">
              Historial acumulado de abonos traspasados a tus ahorros en cada cierre de mes opcional completado.
            </p>

            <div className="flex flex-col gap-3 mt-1">
              {pastSavings.length === 0 ? (
                <div className="py-12 px-4 text-center rounded-2xl bg-slate-955/30 border border-slate-850 border-dashed flex flex-col items-center justify-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-950 flex items-center justify-center text-slate-600">
                    <Icon name="piggy-bank" className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-350">Sin historial registrado en este perfil</p>
                    <p className="text-[10px] text-slate-500 mt-1 max-w-[280px]">Los saldos sobrantes de cierre de mes se archivarán y verás los abonos listados por mes aquí.</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 divide-y divide-slate-850/40">
                  {pastSavings.map((entry) => (
                    <div key={entry.id} className="pt-3.5 first:pt-0 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                          <span className="text-xs font-black text-slate-100">{entry.month}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono font-bold">Ref: {entry.date}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 bg-slate-950/50 p-2.5 rounded-xl border border-slate-850/60 font-mono">
                        <div className="flex flex-col p-1.5 rounded-lg bg-slate-950/40 border border-slate-900">
                          <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">Acumulado USD</span>
                          <span className={`text-xs font-bold mt-1 ${entry.amountUSD > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {entry.amountUSD > 0 ? `+${formatCurrencyVal(entry.amountUSD, 'USD')}` : '$0.00'}
                          </span>
                        </div>
                        <div className="flex flex-col p-1.5 rounded-lg bg-slate-950/40 border border-slate-900">
                          <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">Acumulado VES</span>
                          <span className={`text-xs font-semibold mt-1 ${entry.amountVES > 0 ? 'text-emerald-450' : 'text-slate-500'}`}>
                            {entry.amountVES > 0 ? `+${formatCurrencyVal(entry.amountVES, 'VES')}` : 'Bs. 0,00'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => setIsPastSavingsOpen(false)}
                className="w-full py-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl font-bold text-xs text-slate-300 active:scale-95 transition-all focus:outline-none cursor-pointer"
              >
                Cerrar consulta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
