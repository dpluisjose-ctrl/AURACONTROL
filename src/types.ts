export interface Account {
  id: string;
  name: string;
  type: 'debit' | 'credit' | 'savings' | 'cash';
  balance: number;
  limit: number;
  theme: string;
  number: string;
  bank: string;
  currency: 'USD' | 'VES';
  dueDate?: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  destinationAccountId?: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  date: string;
  description: string;
  exchangeRateUsed?: number;
  bank?: string;
}

export interface Debt {
  id: string;
  type: 'to_pay' | 'to_collect';
  person: string;
  amount: number;
  currency: 'USD' | 'VES';
  dueDate?: string;
  description?: string;
  status: 'pending' | 'paid';
}

export interface CategoryDetail {
  label: string;
  icon: string;
  color: string;
}

export const CATEGORIES: Record<string, CategoryDetail> = {
  food: { label: 'Comida/Restaurantes', icon: 'Utensils', color: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' },
  transport: { label: 'Transporte/Gasolina', icon: 'Car', color: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' },
  entertainment: { label: 'Entretenimiento/Ocio', icon: 'Film', color: 'bg-purple-500/20 text-purple-400 border border-purple-500/30' },
  utilities: { label: 'Servicios/Facturas', icon: 'Zap', color: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' },
  shopping: { label: 'Compras/Ropa', icon: 'ShoppingBag', color: 'bg-rose-500/20 text-rose-400 border border-rose-500/30' },
  salary: { label: 'Sueldo/Ingresos', icon: 'TrendingUp', color: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' },
  transfer: { label: 'Préstamo', icon: 'ArrowLeftRight', color: 'bg-slate-500/20 text-slate-400 border border-slate-550/30' },
  exchange: { label: 'Cambio de Divisa', icon: 'RefreshCw', color: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' },
  other: { label: 'Otros', icon: 'HelpCircle', color: 'bg-slate-500/20 text-slate-450 border border-slate-500/30' }
};

export const CARD_THEMES: Record<string, string> = {
  indigo: 'from-indigo-650 to-slate-900 border-indigo-500/35 text-indigo-100 glow-indigo',
  emerald: 'from-emerald-650 to-slate-900 border-emerald-500/35 text-emerald-100 glow-emerald',
  rose: 'from-rose-650 to-slate-900 border-rose-500/35 text-rose-100',
  amber: 'from-amber-650 to-slate-900 border-amber-500/35 text-amber-100',
  violet: 'from-violet-650 to-slate-900 border-violet-500/35 text-violet-100',
  cyan: 'from-cyan-650 to-slate-900 border-cyan-500/35 text-cyan-100',
  dark: 'from-slate-850 to-slate-950 border-slate-750/50 text-slate-100'
};

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: 'acc-1', name: 'Nómina BBVA (Bs)', type: 'debit', balance: 45000.00, limit: 0, theme: 'indigo', number: '4821', bank: 'BBVA', currency: 'VES' },
  { id: 'acc-2', name: 'Efectivo USD ($)', type: 'cash', balance: 350.00, limit: 0, theme: 'amber', number: '0000', bank: 'Efectivo', currency: 'USD' },
  { id: 'acc-3', name: 'Tarjeta Santander ($)', type: 'credit', balance: -120.50, limit: 1000, theme: 'rose', number: '9012', bank: 'Santander', dueDate: '15', currency: 'USD' },
  { id: 'acc-4', name: 'Ahorros Banesco (Bs)', type: 'savings', balance: 12500.00, limit: 0, theme: 'emerald', number: '7732', bank: 'Banesco', currency: 'VES' }
];

export const DEFAULT_TRANSACTIONS: Transaction[] = [
  { id: 't-1', accountId: 'acc-1', amount: 35000.00, type: 'income', category: 'salary', date: '2026-05-20', description: 'Nómina Quincenal' },
  { id: 't-2', accountId: 'acc-2', amount: 50.00, type: 'income', category: 'other', date: '2026-05-21', description: 'Pago de trabajo freelance' },
  { id: 't-3', accountId: 'acc-1', amount: 4500.00, type: 'expense', category: 'food', date: '2026-05-21', description: 'Almuerzo familiar' },
  { id: 't-4', accountId: 'acc-3', amount: 80.00, type: 'expense', category: 'shopping', date: '2026-05-22', description: 'Zapatos deportivos' },
  { id: 't-5', accountId: 'acc-1', amount: 3200.00, type: 'expense', category: 'utilities', date: '2026-05-22', description: 'Pago de luz eléctrica' }
];

export const DEFAULT_DEBTS: Debt[] = [
  { id: 'd-1', type: 'to_pay', person: 'Carlos Mendoza', amount: 80.00, currency: 'USD', dueDate: '2026-06-05', description: 'Préstamo de dinero para repuestos', status: 'pending' },
  { id: 'd-2', type: 'to_collect', person: 'Ana María Gómez', amount: 3500.00, currency: 'VES', dueDate: '2026-05-28', description: 'Reintegro de almuerzo de cumpleaños', status: 'pending' },
  { id: 'd-3', type: 'to_collect', person: 'Juan Reyes', amount: 15.00, currency: 'USD', dueDate: '2026-05-18', description: 'Pago de café pendiente', status: 'paid' }
];

export function formatCurrencyVal(val: number, currency = 'USD'): string {
  if (currency === 'VES') {
    return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(val).replace('VES', 'Bs.');
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

export interface AppUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  avatar: string; // Emoji representing user
  createdAt: string;
}

