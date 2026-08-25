import React, { useState, useEffect, useMemo } from 'react';
import { Account, formatCurrencyVal } from '../types';
import Icon from './Icon';

interface ExchangeViewProps {
  accounts: Account[];
  exchangeRate: number;
  setExchangeRate: (rate: number) => void;
  onExecuteExchange: (data: {
    sourceId: string;
    destId: string;
    usdAmount: number;
    vesAmount: number;
    rate: number;
  }) => void;
}

export default function ExchangeView({
  accounts,
  exchangeRate,
  setExchangeRate,
  onExecuteExchange
}: ExchangeViewProps) {
  
  const [rateInput, setRateInput] = useState(exchangeRate.toString());
  const [usdVal, setUsdVal] = useState('');
  const [vesVal, setVesVal] = useState('');
  
  const [sourceAccId, setSourceAccId] = useState('');
  const [destAccId, setDestAccId] = useState('');
  
  // Auto-populate accounts when available
  useEffect(() => {
    const usdAcc = accounts.find(a => a.currency === 'USD');
    const vesAcc = accounts.find(a => a.currency === 'VES');
    if (usdAcc) setSourceAccId(usdAcc.id);
    if (vesAcc) setDestAccId(vesAcc.id);
  }, [accounts]);

  // Synchronise rate text when external exchangeRate updates
  useEffect(() => {
    setRateInput(exchangeRate.toString());
  }, [exchangeRate]);

  // Handle exchange rate submission
  const updateRate = () => {
    const parsed = parseFloat(rateInput);
    if (parsed > 0) {
      setExchangeRate(parsed);
      // Update values if already typed
      if (usdVal) {
        setVesVal((parseFloat(usdVal) * parsed).toFixed(2));
      }
    } else {
      alert('Introduce una tasa válida mayor a 0');
    }
  };

  // Dual bindings for conversions
  const handleUsdChange = (val: string) => {
    setUsdVal(val);
    const parsedRate = parseFloat(rateInput) || exchangeRate;
    if (val === '') {
      setVesVal('');
    } else {
      setVesVal((parseFloat(val) * parsedRate).toFixed(2));
    }
  };

  const handleVesChange = (val: string) => {
    setVesVal(val);
    const parsedRate = parseFloat(rateInput) || exchangeRate;
    if (val === '') {
      setUsdVal('');
    } else {
      setUsdVal((parseFloat(val) / parsedRate).toFixed(2));
    }
  };

  const executeExchangeTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const usd = parseFloat(usdVal);
    const ves = parseFloat(vesVal);
    const rate = parseFloat(rateInput) || exchangeRate;

    if (!usd || !ves || usd <= 0) {
      alert('Introduce un monto válido a cambiar');
      return;
    }

    const sourceAcc = accounts.find(a => a.id === sourceAccId);
    const destAcc = accounts.find(a => a.id === destAccId);

    if (!sourceAcc || !destAcc) {
      alert('Debes seleccionar las cuentas de origen y destino');
      return;
    }

    if (sourceAcc.currency === destAcc.currency) {
      alert('Las cuentas de origen y destino deben tener monedas distintas para esta operación');
      return;
    }

    // Verify balance
    const requiredBalance = sourceAcc.currency === 'USD' ? usd : ves;
    if (sourceAcc.balance < requiredBalance && sourceAcc.type !== 'credit') {
      alert(`Saldo insuficiente en cuenta de origen. Requieres ${formatCurrencyVal(requiredBalance, sourceAcc.currency)}`);
      return;
    }

    onExecuteExchange({
      sourceId: sourceAccId,
      destId: destAccId,
      usdAmount: usd,
      vesAmount: ves,
      rate: rate
    });

    // Reset inputs
    setUsdVal('');
    setVesVal('');
  };

  return (
    <div className="p-5 flex flex-col gap-6 animate-fade-in font-sans">
      <div>
        <h2 className="font-display font-extrabold text-xl text-white animate-fade-in">Cambio de Divisa</h2>
        <p className="text-[11px] text-slate-400">Calculadora y registro de operaciones de Cambio ($ &harr; Bs.)</p>
      </div>

      {/* TASA DE CAMBIO CONFIGURATION CARD */}
      <div className="bg-slate-900/15 border border-slate-900 rounded-2xl p-4 flex flex-col gap-3">
        <label className="text-[10px] text-slate-450 uppercase font-black tracking-wider">Establecer Tasa de Cambio al momento</label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">Bs. / $1 USD</span>
            <input 
              type="number"
              step="0.01"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-24 pr-4 text-xs font-bold text-slate-200 focus:outline-none focus:border-indigo-650 transition-colors"
            />
          </div>
          <button 
            type="button"
            onClick={updateRate}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white rounded-xl shadow-md active:scale-95 transition-all focus:outline-none"
          >
            Fijar Tasa
          </button>
        </div>
        <div className="text-[10px] text-slate-500 italic mt-0.5">La tasa fijada se aplicará automáticamente a los cálculos y balances consolidados de tus cuentas.</div>
      </div>

      {/* CONVERSION CALCULATOR */}
      <div className="bg-slate-900/25 border border-indigo-500/10 rounded-2xl p-5 flex flex-col gap-4">
        <h3 className="font-display font-bold text-xs uppercase tracking-wider text-slate-400">Calculadora Conversora</h3>
        
        <div className="flex flex-col gap-3">
          {/* USD Input */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex justify-between items-center">
            <div className="flex-1">
              <span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Dólares (USD)</span>
              <input 
                type="number" 
                placeholder="0.00"
                value={usdVal}
                onChange={(e) => handleUsdChange(e.target.value)}
                className="bg-transparent border-none text-base font-bold text-white focus:outline-none w-full mt-0.5"
              />
            </div>
            <div className="w-8 h-8 rounded-lg bg-indigo-600/15 text-indigo-400 flex items-center justify-center text-xs font-black select-none border border-indigo-500/10">$</div>
          </div>

          {/* Icon Divider */}
          <div className="flex justify-center -my-2.5 relative z-10">
            <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-indigo-400 shadow-md">
              <Icon name="arrow-down-up" className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* VES Input */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex justify-between items-center">
            <div className="flex-1">
              <span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Bolívares (Bs. VES)</span>
              <input 
                type="number" 
                placeholder="0.00"
                value={vesVal}
                onChange={(e) => handleVesChange(e.target.value)}
                className="bg-transparent border-none text-base font-bold text-white focus:outline-none w-full mt-0.5"
              />
            </div>
            <div className="px-1.5 py-1.5 rounded-lg bg-emerald-600/15 text-emerald-400 flex items-center justify-center text-[10px] font-black select-none border border-emerald-500/10">Bs.</div>
          </div>
        </div>
      </div>

      {/* REGISTER ACCOUNT TRANSACTION */}
      {usdVal && vesVal && (
        <form onSubmit={executeExchangeTransaction} className="bg-slate-900/15 border border-slate-900/80 rounded-2xl p-5 flex flex-col gap-4 animate-fade-in">
          <div>
            <h3 className="font-display font-bold text-xs uppercase tracking-wider text-slate-200">Registrar Cambio en mis Cuentas</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Esto creará un movimiento financiero y actualizará los saldos de tus cuentas.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Source Account (Selling) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-400 uppercase font-bold">Cuenta de Origen (Vendes)</label>
              <select 
                value={sourceAccId}
                onChange={(e) => setSourceAccId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-600 font-medium"
              >
                <option value="">Selecciona origen</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                ))}
              </select>
            </div>

            {/* Destination Account (Receiving) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-400 uppercase font-bold">Cuenta de Destino (Recibes)</label>
              <select 
                value={destAccId}
                onChange={(e) => setDestAccId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-600 font-medium"
              >
                <option value="">Selecciona destino</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                ))}
              </select>
            </div>
          </div>

          <button 
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-700 hover:to-indigo-700 rounded-xl font-bold text-xs text-white shadow-lg active:scale-[0.98] transition-transform focus:outline-none"
          >
            Ejecutar y Guardar Operación
          </button>
        </form>
      )}

    </div>
  );
}
