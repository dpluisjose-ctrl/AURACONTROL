import React, { useState, useMemo } from 'react';
import { Transaction, Account, CATEGORIES, formatCurrencyVal } from '../types';
import BudgetView from './BudgetView';
import Icon from './Icon';

interface LedgerViewProps {
  transactions: Transaction[];
  accounts: Account[];
  onDeleteTransaction: (id: string) => void;
  onOpenStatementUploader: () => void;
}

export default function LedgerView({
  transactions,
  accounts,
  onDeleteTransaction,
  onOpenStatementUploader
}: LedgerViewProps) {
  
  const [viewMode, setViewMode] = useState<'transactions' | 'budget'>('transactions');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all'); // 'all', 'income', 'expense', 'transfer'
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [transToDelete, setTransToDelete] = useState<Transaction | null>(null);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Clean target strings to avoid syntax matching problems
      const matchesSearch = t.description.toLowerCase().includes(search.toLowerCase()) || 
                            (CATEGORIES[t.category]?.label || '').toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === 'all' ? true : t.type === typeFilter;
      const matchesAccount = accountFilter === 'all' ? true : t.accountId === accountFilter || t.destinationAccountId === accountFilter;
      
      return matchesSearch && matchesType && matchesAccount;
    });
  }, [transactions, search, typeFilter, accountFilter]);

  return (
    <div className="p-5 flex flex-col gap-5 animate-fade-in font-sans">
      
      {/* TAB HEADER & INTEGRATED TOGGLE */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-display font-extrabold text-xl text-white">Historial y Análisis</h2>
          <p className="text-[11px] text-slate-400 font-medium">Revisa tus movimientos y gráficos del presupuesto</p>
        </div>
        
        <div className="flex bg-slate-900 border border-slate-850 p-1 rounded-xl text-[10px] font-bold">
          <button 
            type="button"
            onClick={onOpenStatementUploader}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors text-slate-300 hover:text-indigo-400 focus:outline-none"
          >
            <Icon name="upload-cloud" className="w-3.5 h-3.5" />
            Escanear
          </button>
          
          <button 
            type="button"
            onClick={() => setViewMode('transactions')}
            className={`px-3 py-1.5 rounded-lg transition-colors focus:outline-none ${viewMode === 'transactions' ? 'bg-indigo-600 text-white font-black' : 'text-slate-400'}`}
          >
            Lista
          </button>
          <button 
            type="button"
            onClick={() => setViewMode('budget')}
            className={`px-3 py-1.5 rounded-lg transition-colors focus:outline-none ${viewMode === 'budget' ? 'bg-indigo-600 text-white font-black' : 'text-slate-400'}`}
          >
            Gráfico
          </button>
        </div>
      </div>

      {viewMode === 'budget' ? (
        <BudgetView transactions={transactions} />
      ) : (
        <>
          {/* SEARCH BAR & FILTERS */}
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Icon name="search" className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                placeholder="Buscar descripción o categoría..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-850 rounded-xl py-2.5 pl-10 pr-10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-600 transition-colors font-medium"
              />
              {search && (
                <button 
                  type="button"
                  onClick={() => setSearch('')} 
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 p-1 focus:outline-none"
                >
                  <Icon name="x" className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select 
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-slate-900 border border-slate-850 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none font-medium"
              >
                <option value="all">Flujos: Todos</option>
                <option value="income">Solo Ingresos</option>
                <option value="expense">Solo Gastos</option>
                <option value="transfer">Solo Transf. / Cambios</option>
              </select>

              <select 
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="bg-slate-900 border border-slate-850 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none font-medium"
              >
                <option value="all">Cuentas: Todas</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* LEDGER LIST */}
          <div className="flex flex-col gap-3 mt-1 pb-10">
            {filteredTransactions.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs bg-slate-900/10 rounded-2xl border border-slate-900 border-dashed">
                No se encontraron transacciones con los filtros aplicados.
              </div>
            ) : (
              filteredTransactions.map(trans => {
                const cat = CATEGORIES[trans.category] || CATEGORIES.other;
                const isExpense = trans.type === 'expense';
                const account = accounts.find(a => a.id === trans.accountId);
                const destAccount = trans.destinationAccountId ? accounts.find(a => a.id === trans.destinationAccountId) : null;
                
                return (
                  <div key={trans.id} className="bg-slate-900/20 border border-slate-900/70 rounded-2xl p-4 flex items-center justify-between group">
                    <div className="flex items-center gap-3.5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cat.color}`}>
                        <Icon name={cat.icon} className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-100 line-clamp-1">{trans.description}</h4>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[10px] text-slate-550 font-mono">{trans.date}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-800"></span>
                          <span className="text-[9px] text-slate-400 font-bold uppercase bg-slate-850 px-1.5 py-0.2 rounded border border-slate-800/60 max-w-44 line-clamp-1">
                            {trans.type === 'transfer' ? `${account?.name} ➔ ${destAccount?.name || 'Vand'}` : account?.name}
                          </span>
                          {trans.bank && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-slate-800"></span>
                              <span className="text-[9px] text-emerald-400 font-extrabold uppercase bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-900/50">
                                {trans.bank}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className={`text-xs font-bold font-display ${trans.category === 'exchange' ? 'text-indigo-400' : trans.type === 'transfer' ? 'text-indigo-300' : isExpense ? 'text-rose-405' : 'text-emerald-450'}`}>
                        {trans.type === 'transfer' ? '' : isExpense ? '-' : '+'}{formatCurrencyVal(trans.amount, account?.currency)}
                      </div>
                      
                      <button 
                        type="button"
                        onClick={() => setTransToDelete(trans)}
                        className="p-1.5 text-slate-600 hover:text-rose-400 rounded-lg active:bg-slate-850/50 transition-colors focus:outline-none"
                      >
                        <Icon name="trash-2" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* CUSTOM TRANSACTION DELETE CONFIRMATION MODAL */}
      {transToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="absolute inset-0" onClick={() => setTransToDelete(null)}></div>
          <div className="w-full max-w-sm bg-slate-900 border border-slate-850 rounded-2xl p-6 relative z-10 animate-slide-up flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                <Icon name="alert-triangle" className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h3 className="font-display font-bold text-sm text-white">¿Eliminar transacción?</h3>
                <p className="text-[10px] text-slate-450">El saldo se ajustará de forma correspondiente.</p>
              </div>
            </div>
            
            <p className="text-[11px] text-slate-300 leading-relaxed bg-slate-950/40 p-3 rounded-xl border border-slate-850">
              ¿Seguro que deseas eliminar la transacción "<strong className="text-white">{transToDelete.description}</strong>" por un monto de <strong className="text-white">{formatCurrencyVal(transToDelete.amount, accounts.find(a => a.id === transToDelete.accountId)?.currency)}</strong>?
            </p>
            
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => setTransToDelete(null)}
                className="py-2.5 bg-slate-850 hover:bg-slate-850 border border-slate-800 rounded-xl font-bold text-xs text-slate-300 active:scale-95 transition-all focus:outline-none"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteTransaction(transToDelete.id);
                  setTransToDelete(null);
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
