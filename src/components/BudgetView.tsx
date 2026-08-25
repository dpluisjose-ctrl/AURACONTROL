import React, { useMemo } from 'react';
import { Transaction, CATEGORIES, formatCurrencyVal } from '../types';

interface BudgetViewProps {
  transactions: Transaction[];
}

export default function BudgetView({ transactions }: BudgetViewProps) {
  // Aggregate expenses by category
  const expenseSummary = useMemo(() => {
    const summary: Record<string, { label: string; amountUSD: number; color: string; icon: string }> = {};
    let totalExpensesUSD = 0;

    // Initialize allowed budget categories
    Object.keys(CATEGORIES).forEach(k => {
      if (k !== 'salary' && k !== 'transfer' && k !== 'exchange') {
        summary[k] = { 
          label: CATEGORIES[k].label, 
          amountUSD: 0, 
          color: CATEGORIES[k].color, // Use the configured theme class
          icon: CATEGORIES[k].icon
        };
      }
    });

    transactions.forEach(t => {
      if (t.type === 'expense') {
        const cat = t.category;
        const target = summary[cat] || summary['other'];
        if (target) {
          target.amountUSD += t.amount; // Use transaction absolute amount
          totalExpensesUSD += t.amount;
        }
      }
    });

    const list = Object.values(summary).filter(item => item.amountUSD > 0);
    return { list, totalExpensesUSD };
  }, [transactions]);

  // Color mappings for SVG paths
  const colorHexes: Record<string, string> = {
    food: '#f59e0b',       // Amber
    transport: '#3b82f6',  // Blue
    entertainment: '#a855f7', // Purple
    utilities: '#06b6d4',  // Cyan
    shopping: '#f43f5e',   // Rose
    other: '#6366f1'       // Indigo fallback
  };

  // Compute angles for SVG donut segments
  const segments = useMemo(() => {
    let accumulatedAngle = 0;
    return expenseSummary.list.map((item) => {
      const percentage = expenseSummary.totalExpensesUSD > 0 
        ? item.amountUSD / expenseSummary.totalExpensesUSD 
        : 0;
      const angle = percentage * 360;
      const startAngle = accumulatedAngle;
      accumulatedAngle += angle;
      return {
        ...item,
        percentage,
        startAngle,
        endAngle: accumulatedAngle
      };
    });
  }, [expenseSummary]);

  // SVG helper coordinates generator
  const getCoordinatesForPercent = (percent: number) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in font-sans">
      {expenseSummary.list.length === 0 ? (
        <div className="py-16 text-center text-slate-500 text-xs bg-slate-900/10 rounded-2xl border border-slate-900 border-dashed">
          Registra algunos egresos en facturas u operaciones para ver los gráficos de presupuesto.
        </div>
      ) : (
        <>
          {/* Beautiful and robust SVG-based Donut Chart */}
          <div className="relative w-48 h-48 mx-auto flex items-center justify-center mt-2">
            <svg viewBox="-1.25 -1.25 2.5 2.5" className="w-full h-full -rotate-90">
              {/* If single segment, render simple circle, otherwise paths */}
              {segments.length === 1 ? (
                <circle 
                  cx="0" 
                  cy="0" 
                  r="1" 
                  fill="transparent" 
                  stroke={Object.values(colorHexes)[0]} 
                  strokeWidth="0.3" 
                />
              ) : (
                segments.map((seg, i) => {
                  const [startX, startY] = getCoordinatesForPercent(seg.startAngle / 360);
                  const [endX, endY] = getCoordinatesForPercent(seg.endAngle / 360);
                  const largeArcFlag = seg.percentage > 0.5 ? 1 : 0;
                  const pathData = [
                    `M ${startX} ${startY}`, // Move to starting point on outer circle
                    `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`, // Arc definition
                    `L 0 0` // Close to center
                  ].join(' ');

                  // Determine color key
                  const catKey = Object.keys(CATEGORIES).find(k => CATEGORIES[k].label === seg.label) || 'other';
                  const strokeColor = colorHexes[catKey] || '#6366f1';

                  return (
                    <path
                      key={i}
                      d={pathData}
                      fill={strokeColor}
                      stroke="#020617" // match slate-950 background
                      strokeWidth="0.02"
                      className="opacity-90 hover:opacity-100 transition-opacity cursor-pointer transform origin-center"
                    />
                  );
                })
              )}
              {/* Inner cutout mask for donut effect */}
              <circle cx="0" cy="0" r="0.75" fill="#020617" />
            </svg>
            
            {/* Centered Total Display */}
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Total Gastado</span>
              <span className="text-base font-display font-black text-white mt-0.5">
                {formatCurrencyVal(expenseSummary.totalExpensesUSD, 'USD')}
              </span>
            </div>
          </div>

          {/* Progress bars list */}
          <div className="flex flex-col gap-4 mt-2">
            <h3 className="font-display font-bold text-xs uppercase tracking-wider text-slate-400">Gastos por Categoría</h3>
            <div className="flex flex-col gap-3">
              {segments.map((item, idx) => {
                const percentage = Math.round(item.percentage * 100);
                const catKey = Object.keys(CATEGORIES).find(k => CATEGORIES[k].label === item.label) || 'other';
                
                // Color mapping styles
                const borderStyles: Record<string, string> = {
                  food: 'border-amber-500/10 bg-amber-500/5 text-amber-400',
                  transport: 'border-blue-500/10 bg-blue-500/5 text-blue-400',
                  entertainment: 'border-purple-500/10 bg-purple-500/5 text-purple-400',
                  utilities: 'border-cyan-500/10 bg-cyan-500/5 text-cyan-400',
                  shopping: 'border-rose-500/10 bg-rose-500/5 text-rose-400',
                  other: 'border-slate-500/10 bg-slate-500/5 text-slate-400'
                };

                const barColors: Record<string, string> = {
                  food: 'bg-amber-500',
                  transport: 'bg-blue-500',
                  entertainment: 'bg-purple-500',
                  utilities: 'bg-cyan-500',
                  shopping: 'bg-rose-500',
                  other: 'bg-slate-500'
                };

                const blockColor = barColors[catKey] || 'bg-slate-400';
                const styleClass = borderStyles[catKey] || borderStyles.other;

                return (
                  <div key={item.label} className={`p-3.5 rounded-2xl border ${styleClass}`}>
                    <div className="flex justify-between items-center text-xs mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${blockColor}`}></span>
                        <span className="font-bold text-slate-200">{item.label}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-100">{formatCurrencyVal(item.amountUSD, 'USD')} ({percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-900/80 h-1.5 rounded-full overflow-hidden border border-slate-800/40">
                      <div className={`h-full rounded-full ${blockColor}`} style={{ width: `${percentage}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
