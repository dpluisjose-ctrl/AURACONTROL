/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Account, 
  Transaction, 
  Debt, 
  DEFAULT_ACCOUNTS, 
  DEFAULT_TRANSACTIONS, 
  DEFAULT_DEBTS,
  formatCurrencyVal,
  AppUser
} from '../types';
import DashboardView from './DashboardView';
import AccountsView from './AccountsView';
import ExchangeView from './ExchangeView';
import LedgerView from './LedgerView';
import DebtsView from './DebtsView';
import PagoMovilView from './PagoMovilView';
import { TransactionModal, AccountModal, DebtModal, PasswordConfirmationModal, BankStatementUploader } from './Modals';
import Icon from './Icon';
import { 
  fetchExchangeRateFromFirestore,
  fetchAccountsFromFirestore,
  fetchTransactionsFromFirestore,
  fetchDebtsFromFirestore,
  fetchPastSavingsFromFirestore,
  saveAccountToFirestore,
  deleteAccountFromFirestore,
  saveTransactionToFirestore,
  deleteTransactionFromFirestore,
  saveDebtToFirestore,
  deleteDebtFromFirestore,
  savePastSavingToFirestore,
  deleteUserFromFirestore,
  saveUserToFirestore,
  saveExchangeRateToFirestore
} from '../sync';

interface WalletAppProps {
  currentUser: AppUser;
  onLogout: () => void;
  onUpdateAvatar: (avatar: string) => void;
  onClose: () => void;
}

export function WalletApp({ currentUser, onLogout, onUpdateAvatar, onClose }: WalletAppProps) {
  // Sincronizador state loader
  const [isSyncing, setIsSyncing] = useState(false);

  // PWA install prompt state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPwaInstructions, setShowPwaInstructions] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const triggerPwaInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User installation choice outcome: ${outcome}`);
      setDeferredPrompt(null);
    } else {
      setShowPwaInstructions(true);
    }
  };

  // -------------------------------------------------------------
  // STATE INITIALISATION (With local storage fallbacks)
  // -------------------------------------------------------------
  const [accounts, setAccounts] = useState<Account[]>(() => {
    try {
      const suffix = currentUser.id;
      const local = localStorage.getItem(`wallet_accounts_${suffix}`);
      return local ? JSON.parse(local) : DEFAULT_ACCOUNTS;
    } catch {
      return DEFAULT_ACCOUNTS;
    }
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const suffix = currentUser.id;
      const local = localStorage.getItem(`wallet_transactions_${suffix}`);
      return local ? JSON.parse(local) : DEFAULT_TRANSACTIONS;
    } catch {
      return DEFAULT_TRANSACTIONS;
    }
  });

  const [exchangeRate, setExchangeRate] = useState<number>(() => {
    try {
      const suffix = currentUser.id;
      const local = localStorage.getItem(`wallet_exchange_rate_${suffix}`);
      return local ? parseFloat(local) : 36.50; // Bs. VES per 1.00 USD
    } catch {
      return 36.50;
    }
  });

  const [bcvRate, setBcvRate] = useState<number>(530.50);

  useEffect(() => {
    const fetchBcvRate = async () => {
      try {
        const response = await fetch('/api/bcv-rate');
        if (response.ok) {
          const data = await response.json();
          if (data && typeof data.rate === 'number') {
            setBcvRate(data.rate);
          }
        }
      } catch (err) {
        console.error("Failed to load BCV rate:", err);
      }
    };
    fetchBcvRate();
  }, []);

  const [debts, setDebts] = useState<Debt[]>(() => {
    try {
      const suffix = currentUser.id;
      const local = localStorage.getItem(`wallet_debts_${suffix}`);
      return local ? JSON.parse(local) : DEFAULT_DEBTS;
    } catch {
      return DEFAULT_DEBTS;
    }
  });

  // Load Firestore details asynchronously upon successful authentication
  useEffect(() => {
    async function syncCloudDataOnBoot() {
      setIsSyncing(true);
      try {
        const rate = await fetchExchangeRateFromFirestore(currentUser.id);
        const accs = await fetchAccountsFromFirestore(currentUser.id);
        const trans = await fetchTransactionsFromFirestore(currentUser.id);
        const dbt = await fetchDebtsFromFirestore(currentUser.id);
        const savs = await fetchPastSavingsFromFirestore(currentUser.id);

        setExchangeRate(rate || 36.50);
        if (accs && accs.length > 0) {
          setAccounts(accs);
        }
        if (trans) setTransactions(trans);
        if (dbt) setDebts(dbt);
        if (savs) setPastSavings(savs);
      } catch (e) {
        console.error("Boot database fetch failed:", e);
      } finally {
        setIsSyncing(false);
      }
    }
    syncCloudDataOnBoot();
  }, [currentUser]);

  const handleUpdateAvatarLocal = async (newAvatar: string) => {
    onUpdateAvatar(newAvatar);
  };

  const handleExportTransactionsExcel = () => {
    if (transactions.length === 0) {
      alert('No hay transacciones registradas para exportar.');
      return;
    }

    const CATEGORY_NAMES: Record<string, string> = {
      food: 'Comida/Alimentos',
      transport: 'Transporte/Gasolina',
      rent: 'Alquiler/Vivienda',
      services: 'Servicios Básicos (Luz, Agua, Cantv)',
      salary: 'Sueldo/Ingresos',
      health: 'Salud/Gasto Médico',
      education: 'Educación/Cursos',
      entertainment: 'Entretenimiento/Ocio',
      other: 'Otros/Varios'
    };

    const data = transactions.map((t, index) => {
      const originAcc = accounts.find(a => a.id === t.accountId);
      const destAcc = t.destinationAccountId ? accounts.find(a => a.id === t.destinationAccountId) : null;
      
      const typeLabel = t.type === 'income' 
        ? 'Ingreso (+)' 
        : t.type === 'expense' 
          ? 'Egreso (-)' 
          : 'Préstamo (➔)';

      const categoryLabel = CATEGORY_NAMES[t.category] || t.category;
      
      return {
        'Nro': index + 1,
        'Fecha (AAAA-MM-DD)': t.date,
        'Descripción': t.description,
        'Tipo de Movimiento': typeLabel,
        'Categoría': categoryLabel,
        'Monto': t.amount,
        'Moneda': originAcc ? originAcc.currency : '',
        'Cuenta / Origen': originAcc ? originAcc.name : '',
        'Cuenta Destino (Transf.)': destAcc ? destAcc.name : 'N/A',
        'Banco Emisor (Capture)': t.bank || 'No aplica',
        'Tasa de Cambio (BVC/BCV)': t.exchangeRateUsed ? t.exchangeRateUsed : 'Tasa default'
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    const colWidths = Object.keys(data[0] || {}).map(key => {
      const maxLength = data.reduce((max, row: any) => {
        const valStr = row[key] ? String(row[key]) : '';
        return Math.max(max, valStr.length);
      }, key.length);
      return { wch: maxLength + 3 };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Transacciones');
    XLSX.writeFile(wb, `historial_bancario_${currentUser.username}.xlsx`);
  };

  const handleDeleteCurrentAccount = async () => {
    const userId = currentUser.id;

    try {
      await deleteUserFromFirestore(userId);
    } catch (e) {
      console.error("Error al borrar usuario de Firestore:", e);
    }
    
    localStorage.removeItem('wallet_logged_in_user');
    localStorage.removeItem(`wallet_accounts_${userId}`);
    localStorage.removeItem(`wallet_transactions_${userId}`);
    localStorage.removeItem(`wallet_debts_${userId}`);
    localStorage.removeItem(`wallet_exchange_rate_${userId}`);
    localStorage.removeItem(`wallet_past_savings_${userId}`);

    try {
      const usersLocal = localStorage.getItem('wallet_registered_users');
      if (usersLocal) {
        const users: AppUser[] = JSON.parse(usersLocal);
        const updatedUsers = users.filter(u => u.id !== userId);
        localStorage.setItem('wallet_registered_users', JSON.stringify(updatedUsers));
      }
    } catch (e) {
      console.error(e);
    }

    onLogout();
    setIsConfirmDeleteOpen(false);
    setIsProfileSettingsOpen(false);
  };

  const [activeTab, setActiveTab] = useState<'dashboard' | 'accounts' | 'debts' | 'exchange' | 'ledger' | 'pagomovil'>('dashboard');
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isPassModalOpen, setIsPassModalOpen] = useState(false);
  const [accountDeletionId, setAccountDeletionId] = useState<string | null>(null);
  
  const [isTransModalOpen, setIsTransModalOpen] = useState(false);
  const [isAccModalOpen, setIsAccModalOpen] = useState(false);
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [isStatementUploaderOpen, setIsStatementUploaderOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  
  const [displayCurrency, setDisplayCurrency] = useState<'USD' | 'VES'>('USD');

  const [isMonthEndModalOpen, setIsMonthEndModalOpen] = useState(false);
  const [cleanMonthEndLedger, setCleanMonthEndLedger] = useState(true);

  const [pastSavings, setPastSavings] = useState<{ id: string, month: string, amountUSD: number, amountVES: number, date: string }[]>(() => {
    try {
      const suffix = currentUser.id;
      const local = localStorage.getItem(`wallet_past_savings_${suffix}`);
      return local ? JSON.parse(local) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(`wallet_accounts_${currentUser.id}`, JSON.stringify(accounts));
  }, [accounts, currentUser]);

  useEffect(() => {
    localStorage.setItem(`wallet_transactions_${currentUser.id}`, JSON.stringify(transactions));
  }, [transactions, currentUser]);

  useEffect(() => {
    localStorage.setItem(`wallet_exchange_rate_${currentUser.id}`, exchangeRate.toString());
  }, [exchangeRate, currentUser]);

  useEffect(() => {
    localStorage.setItem(`wallet_debts_${currentUser.id}`, JSON.stringify(debts));
  }, [debts, currentUser]);

  useEffect(() => {
    localStorage.setItem(`wallet_past_savings_${currentUser.id}`, JSON.stringify(pastSavings));
  }, [pastSavings, currentUser]);

  const totals = useMemo(() => {
    let netWorthUSD = 0;
    let totalSavingsUSD = 0;
    let totalDebtUSD = 0;
    let availableCashUSD = 0;

    accounts.forEach(acc => {
      const balUSD = acc.currency === 'USD' ? acc.balance : acc.balance / exchangeRate;
      netWorthUSD += balUSD;
      
      if (acc.type === 'savings') {
        totalSavingsUSD += balUSD;
      } else if (acc.type === 'credit') {
        totalDebtUSD += Math.abs(balUSD);
      } else {
        availableCashUSD += balUSD;
      }
    });

    const multiplier = displayCurrency === 'VES' ? exchangeRate : 1;
    return {
      netWorth: netWorthUSD * multiplier,
      totalSavings: totalSavingsUSD * multiplier,
      totalDebt: totalDebtUSD * multiplier,
      availableCash: availableCashUSD * multiplier,
    };
  }, [accounts, exchangeRate, displayCurrency]);

  const addGroupTransactions = async (newTransItems: {
    type: 'income' | 'expense' | 'transfer';
    accountId: string;
    destinationAccountId?: string;
    amount: number;
    category: string;
    date: string;
    description: string;
    bank?: string;
  }[]) => {
    if (newTransItems.length === 0) return;

    let currentAccounts = [...accounts];
    const createdTransactions: Transaction[] = [];

    newTransItems.forEach((trans, index) => {
      const newTrans: Transaction = {
        ...trans,
        id: 't-' + (Date.now() + index),
        exchangeRateUsed: exchangeRate
      };
      createdTransactions.push(newTrans);

      currentAccounts = currentAccounts.map(acc => {
        if (trans.type === 'transfer') {
          if (acc.id === trans.accountId) {
            return { ...acc, balance: acc.balance - trans.amount };
          }
          if (acc.id === trans.destinationAccountId) {
            const originAcc = currentAccounts.find(a => a.id === trans.accountId);
            if (!originAcc) return acc;

            if (acc.currency === originAcc.currency) {
              return { ...acc, balance: acc.balance + trans.amount };
            } else {
              const convertedAmount = originAcc.currency === 'USD'
                ? trans.amount * exchangeRate
                : trans.amount / exchangeRate;
              return { ...acc, balance: acc.balance + convertedAmount };
            }
          }
        } else {
          if (acc.id === trans.accountId) {
            const modifier = trans.type === 'income' ? 1 : -1;
            return { ...acc, balance: acc.balance + (trans.amount * modifier) };
          }
        }
        return acc;
      });
    });

    setAccounts(currentAccounts);
    setTransactions(prev => [...createdTransactions, ...prev]);

    try {
      for (const newTrans of createdTransactions) {
        await saveTransactionToFirestore(currentUser.id, newTrans);
      }
      for (const acc of currentAccounts) {
        await saveAccountToFirestore(currentUser.id, acc);
      }
    } catch (e) {
      console.error("Error syncing transactions to Firestore:", e);
    }
  };

  const addTransaction = async (trans: {
    type: 'income' | 'expense' | 'transfer';
    accountId: string;
    destinationAccountId?: string;
    amount: number;
    category: string;
    date: string;
    description: string;
    bank?: string;
  }) => {
    const newTrans: Transaction = {
      ...trans,
      id: 't-' + Date.now(),
      exchangeRateUsed: exchangeRate
    };

    const finalAccounts = accounts.map(acc => {
      if (trans.type === 'transfer') {
        if (acc.id === trans.accountId) {
          return { ...acc, balance: acc.balance - trans.amount };
        }
        if (acc.id === trans.destinationAccountId) {
          const originAcc = accounts.find(a => a.id === trans.accountId);
          if (!originAcc) return acc;

          if (acc.currency === originAcc.currency) {
            return { ...acc, balance: acc.balance + trans.amount };
          } else {
            const convertedAmount = originAcc.currency === 'USD'
              ? trans.amount * exchangeRate
              : trans.amount / exchangeRate;
            return { ...acc, balance: acc.balance + convertedAmount };
          }
        }
      } else {
        if (acc.id === trans.accountId) {
          const modifier = trans.type === 'income' ? 1 : -1;
          return { ...acc, balance: acc.balance + (trans.amount * modifier) };
        }
      }
      return acc;
    });

    setAccounts(finalAccounts);
    setTransactions(prev => [newTrans, ...prev]);
    setIsTransModalOpen(false);

    try {
      await saveTransactionToFirestore(currentUser.id, newTrans);
      for (const acc of finalAccounts) {
        await saveAccountToFirestore(currentUser.id, acc);
      }
    } catch (e) {
      console.error("Error syncing transactions to Firestore:", e);
    }
  };

  const addExchangeTransaction = async (data: {
    sourceId: string;
    destId: string;
    usdAmount: number;
    vesAmount: number;
    rate: number;
  }) => {
    const { sourceId, destId, usdAmount, vesAmount, rate } = data;
    const sourceAcc = accounts.find(a => a.id === sourceId);
    const destAcc = accounts.find(a => a.id === destId);
    if (!sourceAcc || !destAcc) return;

    const transId = 't-' + Date.now();
    const exchangeTrans: Transaction = {
      id: transId,
      accountId: sourceId,
      destinationAccountId: destId,
      amount: sourceAcc.currency === 'USD' ? usdAmount : vesAmount,
      type: 'transfer',
      category: 'exchange',
      date: new Date().toISOString().split('T')[0],
      description: `Cambio: $${usdAmount.toFixed(2)} ➔ Bs.${vesAmount.toFixed(2)} (Tasa: ${rate.toFixed(2)})`,
      exchangeRateUsed: rate
    };

    const finalAccounts = accounts.map(acc => {
      if (acc.id === sourceId) {
        const deduct = sourceAcc.currency === 'USD' ? usdAmount : vesAmount;
        return { ...acc, balance: acc.balance - deduct };
      }
      if (acc.id === destId) {
        const add = destAcc.currency === 'USD' ? usdAmount : vesAmount;
        return { ...acc, balance: acc.balance + add };
      }
      return acc;
    });

    setAccounts(finalAccounts);
    setTransactions(prev => [exchangeTrans, ...prev]);
    
    const newDebt: Debt = {
      id: 'd-' + Date.now(),
      type: 'to_pay',
      person: 'Cambio de Dólares',
      amount: usdAmount,
      currency: 'USD',
      description: `Operación cambio: $${usdAmount.toFixed(2)}`,
      status: 'pending'
    };
    setDebts(prev => [...prev, newDebt]);

    setActiveTab('dashboard');

    try {
      await saveTransactionToFirestore(currentUser.id, exchangeTrans);
      await saveDebtToFirestore(currentUser.id, newDebt);
      for (const acc of finalAccounts) {
        if (acc.id === sourceId || acc.id === destId) {
          await saveAccountToFirestore(currentUser.id, acc);
        }
      }
    } catch (e) {
      console.error("Error syncing exchange transaction to Firestore:", e);
    }
  };

  const deleteTransaction = async (id: string) => {
    const trans = transactions.find(t => t.id === id);
    if (!trans) return;

    const finalAccounts = accounts.map(acc => {
      if (trans.type === 'transfer') {
        if (acc.id === trans.accountId) {
          return { ...acc, balance: acc.balance + trans.amount };
        }
        if (acc.id === trans.destinationAccountId) {
          const originAcc = accounts.find(a => a.id === trans.accountId);
          const destAcc = accounts.find(a => a.id === trans.destinationAccountId);
          let deductAmount = trans.amount;
          if (originAcc && destAcc && originAcc.currency !== destAcc.currency) {
            const rateToUse = trans.exchangeRateUsed || exchangeRate;
            deductAmount = originAcc.currency === 'USD' 
              ? trans.amount * rateToUse 
              : trans.amount / rateToUse;
          }
          return { ...acc, balance: acc.balance - deductAmount };
        }
      } else {
        if (acc.id === trans.accountId) {
          const modifier = trans.type === 'income' ? -1 : 1;
          return { ...acc, balance: acc.balance + (trans.amount * modifier) };
        }
      }
      return acc;
    });

    setAccounts(finalAccounts);
    setTransactions(prev => prev.filter(t => t.id !== id));

    try {
      await deleteTransactionFromFirestore(currentUser.id, id);
      for (const acc of finalAccounts) {
        await saveAccountToFirestore(currentUser.id, acc);
      }
    } catch (e) {
      console.error("Error deleting transaction from Firestore:", e);
    }
  };

  const saveAccount = async (accData: {
    name: string;
    type: 'debit' | 'credit' | 'savings' | 'cash';
    currency: 'USD' | 'VES';
    balance: number;
    limit: number;
    theme: string;
    number: string;
    bank: string;
    dueDate?: string;
  }) => {
    if (editingAccount) {
      const updatedAccounts = accounts.map(acc => 
        acc.id === editingAccount.id ? { ...acc, ...accData } : acc
      );
      setAccounts(updatedAccounts);
      setSelectedAccount(null);
      setEditingAccount(null);

      const fullAcc = updatedAccounts.find(a => a.id === editingAccount.id);
      if (fullAcc) await saveAccountToFirestore(currentUser.id, fullAcc);
    } else {
      const newAcc: Account = {
        ...accData,
        id: 'acc-' + Date.now()
      };
      setAccounts(prev => [...prev, newAcc]);
      await saveAccountToFirestore(currentUser.id, newAcc);
    }
    setIsAccModalOpen(false);
  };

  const confirmAccountDeletion = (password: string) => {
    const isCorrect = btoa(password + '_secure_wallet_salt') === currentUser.passwordHash;
    if (isCorrect) {
      if (accountDeletionId) {
        deleteAccount(accountDeletionId);
        setIsPassModalOpen(false);
        setAccountDeletionId(null);
      }
    } else {
      alert('Contraseña incorrecta');
    }
  };

  const initAccountDeletion = (id: string) => {
    setAccountDeletionId(id);
    setIsPassModalOpen(true);
  };

  const deleteAccount = async (id: string) => {
    setAccounts(prev => prev.filter(acc => acc.id !== id));
    setTransactions(prev => prev.filter(t => t.accountId !== id && t.destinationAccountId !== id));
    setSelectedAccount(null);

    try {
      await deleteAccountFromFirestore(currentUser.id, id);
      const toDelete = transactions.filter(t => t.accountId === id || t.destinationAccountId === id);
      for (const t of toDelete) {
        await deleteTransactionFromFirestore(currentUser.id, t.id);
      }
    } catch (e) {
      console.error("Error deleting account from Firestore:", e);
    }
  };

  const saveDebt = async (debtData: {
    type: 'to_pay' | 'to_collect';
    person: string;
    amount: number;
    currency: 'USD' | 'VES';
    dueDate?: string;
    description: string;
  }) => {
    if (editingDebt) {
      const updatedDebts = debts.map(d => 
        d.id === editingDebt.id ? { ...d, ...debtData, status: d.status } : d
      );
      setDebts(updatedDebts);
      setEditingDebt(null);

      const fullDebt = updatedDebts.find(d => d.id === editingDebt.id);
      if (fullDebt) await saveDebtToFirestore(currentUser.id, fullDebt);
    } else {
      const newDebt: Debt = {
        ...debtData,
        id: 'd-' + Date.now(),
        status: 'pending'
      };
      setDebts(prev => [...prev, newDebt]);
      await saveDebtToFirestore(currentUser.id, newDebt);
    }
    setIsDebtModalOpen(false);
  };

  const markDebtAsPaid = async (debtId: string, accountId: string | null) => {
    const debt = debts.find(d => d.id === debtId);
    if (!debt) return;

    let newTrans: Transaction | null = null;
    let finalAccounts = [...accounts];

    if (accountId) {
      const account = accounts.find(a => a.id === accountId);
      if (!account) return;

      let transAmount = debt.amount;
      if (account.currency !== debt.currency) {
        if (account.currency === 'USD') {
          transAmount = debt.amount / exchangeRate;
        } else {
          transAmount = debt.amount * exchangeRate;
        }
      }

      newTrans = {
        id: 't-' + Date.now(),
        accountId: accountId,
        amount: transAmount,
        type: debt.type === 'to_pay' ? 'expense' : 'income',
        category: 'other',
        date: new Date().toISOString().split('T')[0],
        description: `${debt.type === 'to_pay' ? 'Pago de deuda' : 'Cobro de deudao'} ➔ ${debt.person} (${debt.description || 'Sin concepto'})`
      };

      finalAccounts = accounts.map(acc => {
        if (acc.id === accountId) {
          const modifier = debt.type === 'to_pay' ? -1 : 1;
          return { ...acc, balance: acc.balance + (transAmount * modifier) };
        }
        return acc;
      });

      setAccounts(finalAccounts);
      setTransactions(prev => [newTrans!, ...prev]);
    }

    const finalDebts = debts.map(d => d.id === debtId ? { ...d, status: 'paid' as const } : d);
    setDebts(finalDebts);

    try {
      const updatedDebt = finalDebts.find(d => d.id === debtId);
      if (updatedDebt) await saveDebtToFirestore(currentUser.id, updatedDebt);
      if (accountId && newTrans) {
        await saveTransactionToFirestore(currentUser.id, newTrans);
        for (const acc of finalAccounts) {
          if (acc.id === accountId) {
            await saveAccountToFirestore(currentUser.id, acc);
          }
        }
      }
    } catch (e) {
      console.error("Error setting debt as paid inside Firestore:", e);
    }
  };

  const deleteDebt = async (id: string) => {
    setDebts(prev => prev.filter(d => d.id !== id));
    await deleteDebtFromFirestore(currentUser.id, id);
  };

  const executeMonthEndClose = async (cleanLedger: boolean) => {
    let totalUSDToSweep = 0;
    let totalVESToSweep = 0;

    const sweptAccounts = accounts.map(acc => {
      if (acc.balance > 0 && acc.type !== 'savings') {
        if (acc.currency === 'USD') {
          totalUSDToSweep += acc.balance;
        } else {
          totalVESToSweep += acc.balance;
        }
        return { ...acc, balance: 0 };
      }
      return acc;
    });

    let finalAccounts = [...sweptAccounts];

    if (totalUSDToSweep > 0) {
      const existingUSD = finalAccounts.find(
        a => a.type === 'savings' && a.currency === 'USD' && (a.name === 'Ahorro ($)' || a.name.toLowerCase().includes('ahorros') || a.name.toLowerCase().includes('ahorro'))
      );
      if (existingUSD) {
        finalAccounts = finalAccounts.map(a => a.id === existingUSD.id ? { ...a, balance: a.balance + totalUSDToSweep } : a);
      } else {
        finalAccounts.push({
          id: 'acc-savings-usd-' + Date.now(),
          name: 'Ahorro ($)',
          type: 'savings',
          balance: totalUSDToSweep,
          limit: 0,
          theme: 'emerald',
          number: '0000',
          bank: 'Ahorros',
          currency: 'USD'
        });
      }
    }

    if (totalVESToSweep > 0) {
      const existingVES = finalAccounts.find(
        a => a.type === 'savings' && a.currency === 'VES' && (a.name === 'Ahorro (Bs)' || a.name.toLowerCase().includes('ahorros') || a.name.toLowerCase().includes('ahorro'))
      );
      if (existingVES) {
        finalAccounts = finalAccounts.map(a => a.id === existingVES.id ? { ...a, balance: a.balance + totalVESToSweep } : a);
      } else {
        finalAccounts.push({
          id: 'acc-savings-ves-' + Date.now(),
          name: 'Ahorro (Bs)',
          type: 'savings',
          balance: totalVESToSweep,
          limit: 0,
          theme: 'emerald',
          number: '0000',
          bank: 'Ahorros',
          currency: 'VES'
        });
      }
    }

    setAccounts(finalAccounts);

    let newTransactions: Transaction[] = [...transactions];
    if (cleanLedger) {
      newTransactions = [];
      if (totalUSDToSweep > 0) {
        newTransactions.push({
          id: 't-sweep-usd-' + Date.now(),
          accountId: 'general',
          amount: totalUSDToSweep,
          type: 'income',
          category: 'other',
          date: new Date().toISOString().split('T')[0],
          description: 'Consolidación de Cierre - Ahorro ($)'
        });
      }
      if (totalVESToSweep > 0) {
        newTransactions.push({
          id: 't-sweep-ves-' + Date.now(),
          accountId: 'general',
          amount: totalVESToSweep,
          type: 'income',
          category: 'other',
          date: new Date().toISOString().split('T')[0],
          description: 'Consolidación de Cierre - Ahorro (Bs)'
        });
      }
    } else {
      if (totalUSDToSweep > 0) {
        newTransactions.unshift({
          id: 't-sweep-usd-' + Date.now(),
          accountId: 'general',
          amount: totalUSDToSweep,
          type: 'income',
          category: 'other',
          date: new Date().toISOString().split('T')[0],
          description: 'Traspaso a Ahorro ($) por cierre de mes'
        });
      }
      if (totalVESToSweep > 0) {
        newTransactions.unshift({
          id: 't-sweep-ves-' + Date.now(),
          accountId: 'general',
          amount: totalVESToSweep,
          type: 'income',
          category: 'other',
          date: new Date().toISOString().split('T')[0],
          description: 'Traspaso a Ahorro (Bs) por cierre de mes'
        });
      }
    }

    setTransactions(newTransactions);

    const activeDebts = debts.filter(d => d.status === 'pending');
    setDebts(activeDebts);

    let newPastSavingEntry: any = null;
    if (totalUSDToSweep > 0 || totalVESToSweep > 0) {
      const monthNamesSpanish = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
      ];
      const today = new Date();
      const currentMonthLabel = `${monthNamesSpanish[today.getMonth()]} ${today.getFullYear()}`;
      
      newPastSavingEntry = {
        id: 'ps-' + Date.now(),
        month: currentMonthLabel,
        amountUSD: totalUSDToSweep,
        amountVES: totalVESToSweep,
        date: today.toISOString().split('T')[0]
      };
      
      setPastSavings(prev => [newPastSavingEntry, ...prev]);
    }

    setIsMonthEndModalOpen(false);

    try {
      await saveExchangeRateToFirestore(currentUser.id, exchangeRate);
      for (const acc of finalAccounts) {
        await saveAccountToFirestore(currentUser.id, acc);
      }
      if (cleanLedger) {
        for (const t of transactions) {
          await deleteTransactionFromFirestore(currentUser.id, t.id);
        }
      }
      for (const t of newTransactions) {
        await saveTransactionToFirestore(currentUser.id, t);
      }
      const debtsToDelete = debts.filter(d => d.status !== 'pending');
      for (const d of debtsToDelete) {
        await deleteDebtFromFirestore(currentUser.id, d.id);
      }
      if (newPastSavingEntry) {
        await savePastSavingToFirestore(currentUser.id, newPastSavingEntry);
      }
    } catch (e) {
      console.error("Error during sweep Firestore sync:", e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 font-sans">
      <div className="flex-1 flex md:flex-row flex-col h-full bg-slate-950 relative overflow-hidden">
        
        {/* DESKTOP SIDEBAR */}
        <aside className="hidden md:flex flex-col w-64 border-r border-slate-900 bg-slate-950 px-5 pt-6 pb-4 justify-between select-none shrink-0 h-full">
          <div className="flex flex-col gap-6">
            {/* Logo Brand */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
                  <Icon name="wallet" className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h1 className="font-display font-black text-sm tracking-tight text-white leading-none">Billetera Aura</h1>
                  <span className="text-[9px] text-slate-550 font-black font-mono tracking-tight block mt-1 uppercase">Tasa: Bs. {exchangeRate.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Navigation Links */}
            <div className="flex flex-col gap-1">
              <button 
                type="button"
                onClick={() => { setActiveTab('dashboard'); setSelectedAccount(null); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs focus:outline-none ${activeTab === 'dashboard' ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'}`}
              >
                <Icon name="layout-dashboard" className="w-4 h-4" />
                <span>Resumen</span>
              </button>
              <button 
                type="button"
                onClick={() => { setActiveTab('accounts'); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs focus:outline-none ${activeTab === 'accounts' ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'}`}
              >
                <Icon name="credit-card" className="w-4 h-4" />
                <span>Cuentas</span>
              </button>
              <button 
                type="button"
                onClick={() => { setActiveTab('debts'); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs focus:outline-none ${activeTab === 'debts' ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'}`}
              >
                <Icon name="users" className="w-4 h-4" />
                <span>Deudas</span>
              </button>
              <button 
                type="button"
                onClick={() => { setActiveTab('exchange'); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs focus:outline-none ${activeTab === 'exchange' ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'}`}
              >
                <Icon name="refresh-cw" className="w-4 h-4" />
                <span>Cambio de Tasa</span>
              </button>
              <button 
                type="button"
                onClick={() => { setActiveTab('pagomovil'); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs focus:outline-none ${activeTab === 'pagomovil' ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'}`}
              >
                <Icon name="smartphone" className="w-4 h-4" />
                <span>Pago Móvil tpago</span>
              </button>
              <button 
                type="button"
                onClick={() => { setActiveTab('ledger'); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs focus:outline-none ${activeTab === 'ledger' ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'}`}
              >
                <Icon name="list-ordered" className="w-4 h-4" />
                <span>Historial General</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-4 border-t border-slate-900">
            {/* VOLVER AL ASISTENTE CTA */}
            <button
              type="button"
              onClick={onClose}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-indigo-900/20 hover:bg-indigo-900/30 border border-indigo-500/20 text-indigo-400 hover:text-indigo-300 transition-all font-bold text-xs focus:outline-none cursor-pointer"
            >
              <Icon name="arrow-left" className="w-4 h-4" />
              <span>Volver al Asistente</span>
            </button>

            {/* Profile trigger settings */}
            <button 
              type="button"
              onClick={() => setIsProfileSettingsOpen(true)}
              className="w-full flex items-center justify-between p-2 bg-slate-900/60 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 rounded-2xl transition-all focus:outline-none cursor-pointer text-left"
              title="Ajustes de Perfil"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xl shrink-0 shadow-inner">
                  {currentUser.avatar}
                </div>
                <div className="min-w-0 flex flex-col">
                  <span className="text-xs font-black text-white truncate leading-tight">{currentUser.username}</span>
                  <span className="text-[8px] text-slate-500 font-bold uppercase truncate tracking-tight mt-0.5">{currentUser.email}</span>
                </div>
              </div>
              <Icon name="settings" className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </aside>

        {/* MOBILE OVERLAY NAVIGATION DRAWER */}
        {isSidebarOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex animate-fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setIsSidebarOpen(false)}></div>
            <div className="relative w-64 max-w-[80vw] h-full bg-slate-950 border-r border-slate-900 p-5 flex flex-col justify-between select-none animate-slide-right">
              <div className="flex flex-col gap-6">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Icon name="wallet" className="w-5 h-5 text-indigo-400" />
                    <span className="font-display font-black text-xs text-white">Billetera Aura</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setIsSidebarOpen(false)}
                    className="p-1 hover:bg-slate-900 text-slate-500 hover:text-white rounded-lg transition-all focus:outline-none"
                  >
                    <Icon name="x" className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-col gap-1">
                  <button 
                    type="button"
                    onClick={() => { setActiveTab('dashboard'); setSelectedAccount(null); setIsSidebarOpen(false); }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs focus:outline-none ${activeTab === 'dashboard' ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <Icon name="layout-dashboard" className="w-4 h-4" />
                    <span>Resumen</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setActiveTab('accounts'); setIsSidebarOpen(false); }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs focus:outline-none ${activeTab === 'accounts' ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <Icon name="credit-card" className="w-4 h-4" />
                    <span>Cuentas</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setActiveTab('debts'); setIsSidebarOpen(false); }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs focus:outline-none ${activeTab === 'debts' ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <Icon name="users" className="w-4 h-4" />
                    <span>Deudas</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setActiveTab('exchange'); setIsSidebarOpen(false); }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs focus:outline-none ${activeTab === 'exchange' ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <Icon name="refresh-cw" className="w-4 h-4" />
                    <span>Cambio de Tasa</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setActiveTab('pagomovil'); setIsSidebarOpen(false); }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs focus:outline-none ${activeTab === 'pagomovil' ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <Icon name="smartphone" className="w-4 h-4" />
                    <span>Pago Móvil tpago</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setActiveTab('ledger'); setIsSidebarOpen(false); }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs focus:outline-none ${activeTab === 'ledger' ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <Icon name="list-ordered" className="w-4 h-4" />
                    <span>Historial General</span>
                  </button>

                  <button 
                    type="button"
                    onClick={async () => { setIsMonthEndModalOpen(true); setIsSidebarOpen(false); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs text-indigo-400 bg-indigo-950/20 hover:bg-indigo-900/10 border border-indigo-900/20 hover:border-indigo-850/45 mt-2 focus:outline-none cursor-pointer"
                  >
                    <Icon name="calendar-check" className="w-4 h-4 text-indigo-400 animate-pulse" />
                    <span>Cierre de Mes</span>
                  </button>

                  <button 
                    type="button"
                    onClick={async () => { setIsSidebarOpen(false); triggerPwaInstall(); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-bold text-xs text-emerald-400 bg-emerald-950/20 hover:bg-emerald-900/10 border border-emerald-900/20 hover:border-emerald-850/45 mt-1 focus:outline-none cursor-pointer"
                  >
                    <Icon name="smartphone" className="w-4 h-4 text-emerald-400" />
                    <span>Instalar En Pantalla</span>
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-900 pt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-indigo-950 border border-indigo-900/50 text-indigo-400 font-bold text-xs focus:outline-none cursor-pointer"
                >
                  <Icon name="arrow-left" className="w-4 h-4" />
                  <span>Volver al Asistente</span>
                </button>

                <button 
                  type="button"
                  onClick={() => { setIsProfileSettingsOpen(true); setIsSidebarOpen(false); }}
                  className="w-full flex items-center justify-between p-2 bg-slate-900 border border-slate-850 hover:bg-slate-850 rounded-xl transition-all focus:outline-none cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg shrink-0">{currentUser.avatar}</span>
                    <div className="min-w-0 flex flex-col">
                      <span className="text-xs font-black text-white truncate leading-tight">{currentUser.username}</span>
                      <span className="text-[8px] text-slate-550 font-bold uppercase truncate tracking-tight mt-0.5">{currentUser.email}</span>
                    </div>
                  </div>
                  <Icon name="settings" className="w-3.5 h-3.5 text-slate-555" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RIGHT MAIN WORKSPACE CANVAS */}
        <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
          
          {/* APP SHARED HEADER */}
          <header className="px-5 pt-4 pb-3 flex justify-between items-center border-b border-slate-900 bg-slate-950/85 backdrop-blur-md sticky top-0 z-30 select-none">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-900 border border-slate-850 md:hidden flex items-center justify-center focus:outline-none active:scale-95 transition-transform"
                title="Abrir Menú"
              >
                <Icon name="menu" className="w-4.5 h-4.5" />
              </button>

              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow shadow-indigo-505/20 md:hidden">
                  <Icon name="wallet" className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <h1 className="font-display font-black text-sm md:text-base tracking-tight bg-gradient-to-r from-indigo-200 via-slate-100 to-violet-200 bg-clip-text text-transparent">
                    {activeTab === 'dashboard' && 'Resumen Financiero'}
                    {activeTab === 'accounts' && 'Cuentas & Tarjetas'}
                    {activeTab === 'debts' && 'Libro de Deudas'}
                    {activeTab === 'exchange' && 'Conversión de Divisas'}
                    {activeTab === 'pagomovil' && 'Pago Móvil • tpago'}
                    {activeTab === 'ledger' && 'Historial de Transacciones'}
                  </h1>
                  <div className="text-[8px] md:text-[9px] text-slate-550 font-bold font-mono uppercase tracking-wider md:hidden">Tasa VES: {exchangeRate.toFixed(2)}</div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* VOLVER AL ASISTENTE TOP HEADER BUTTON (Visible on desktop only) */}
              <button
                type="button"
                onClick={onClose}
                className="hidden md:flex px-3.5 py-1.5 rounded-full bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs font-bold text-slate-350 active:scale-95 transition-all items-center gap-1.5 focus:outline-none cursor-pointer"
              >
                <Icon name="arrow-left" className="w-3.5 h-3.5" />
                <span>Volver al Asistente</span>
              </button>

              <button 
                type="button"
                onClick={() => setIsTransModalOpen(true)}
                className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 active:scale-95 transition-all flex items-center gap-1.5 focus:outline-none cursor-pointer"
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                <span>Operación</span>
              </button>
            </div>
          </header>

          {/* COMPONENT VIEWPORTS SCROLLER */}
          <main className="flex-1 overflow-y-auto custom-scroll pb-24 h-full">
            {activeTab === 'dashboard' && (
              <DashboardView 
                totals={totals}
                accounts={accounts}
                transactions={transactions}
                displayCurrency={displayCurrency}
                setDisplayCurrency={setDisplayCurrency}
                onSelectAccount={(acc) => { setSelectedAccount(acc); setActiveTab('accounts'); }}
                exchangeRate={exchangeRate}
                bcvRate={bcvRate}
              />
            )}
            {activeTab === 'accounts' && (
              <AccountsView 
                accounts={accounts}
                transactions={transactions}
                selectedAccount={selectedAccount}
                onSelectAccount={setSelectedAccount}
                onAddAccount={() => { setEditingAccount(null); setIsAccModalOpen(true); }}
                onEditAccount={(acc) => { setEditingAccount(acc); setIsAccModalOpen(true); }}
                onDeleteAccount={initAccountDeletion}
                pastSavings={pastSavings}
              />
            )}
            {activeTab === 'debts' && (
              <DebtsView 
                debts={debts}
                accounts={accounts}
                onAddDebt={() => { setEditingDebt(null); setIsDebtModalOpen(true); }}
                onEditDebt={(debt) => { setEditingDebt(debt); setIsDebtModalOpen(true); }}
                onDeleteDebt={deleteDebt}
                onMarkAsPaid={markDebtAsPaid}
                formatCurrencyVal={formatCurrencyVal}
                exchangeRate={exchangeRate}
              />
            )}
            {activeTab === 'exchange' && (
              <ExchangeView 
                accounts={accounts}
                exchangeRate={exchangeRate}
                setExchangeRate={setExchangeRate}
                onExecuteExchange={addExchangeTransaction}
              />
            )}
            {activeTab === 'pagomovil' && (
              <PagoMovilView 
                accounts={accounts}
                transactions={transactions}
                exchangeRate={exchangeRate}
                bcvRate={bcvRate}
                onExecutePayment={async (data) => {
                  const todayStr = new Date().toISOString().split('T')[0];
                  await addTransaction({
                    type: data.type,
                    accountId: data.accountId,
                    amount: data.amount,
                    category: data.category,
                    date: todayStr,
                    description: data.description
                  });
                  
                  const commAmount = Number((data.amount * 0.003).toFixed(2));
                  if (commAmount > 0) {
                    await addTransaction({
                      type: 'expense',
                      accountId: data.accountId,
                      amount: commAmount,
                      category: 'other',
                      date: todayStr,
                      description: 'Comisión Pago Móvil'
                    });
                  }
                }}
              />
            )}
            {activeTab === 'ledger' && (
              <LedgerView 
                transactions={transactions}
                accounts={accounts}
                onDeleteTransaction={deleteTransaction}
                onOpenStatementUploader={() => setIsStatementUploaderOpen(true)}
              />
            )}
          </main>
        </div>
      </div>

      {/* BOTTOM NAVIGATION DRAWER - PERSISTENT BAR */}
      <nav className="absolute bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-lg border-t border-slate-850/80 px-3 pt-3 pb-2.5 safe-padding-bottom flex justify-between items-center z-45 select-none md:hidden animate-fade-in">
        <button 
          type="button"
          onClick={() => { setActiveTab('dashboard'); setSelectedAccount(null); }}
          className={`flex flex-col items-center gap-1 focus:outline-none ${activeTab === 'dashboard' ? 'text-indigo-400 scale-[1.03] font-bold' : 'text-slate-455 hover:text-slate-300'}`}
        >
          <Icon name="layout-dashboard" className="w-4.5 h-4.5" />
          <span className="text-[8px] uppercase tracking-wider font-extrabold text-center">Resumen</span>
        </button>

        <button 
          type="button"
          onClick={() => { setActiveTab('accounts'); }}
          className={`flex flex-col items-center gap-1 focus:outline-none ${activeTab === 'accounts' ? 'text-indigo-400 scale-[1.03] font-bold' : 'text-slate-455 hover:text-slate-300'}`}
        >
          <Icon name="credit-card" className="w-4.5 h-4.5" />
          <span className="text-[8px] uppercase tracking-wider font-extrabold text-center">Cuentas</span>
        </button>

        <button 
          type="button"
          onClick={() => { setActiveTab('debts'); }}
          className={`flex flex-col items-center gap-1 focus:outline-none ${activeTab === 'debts' ? 'text-indigo-400 scale-[1.03] font-bold' : 'text-slate-455 hover:text-slate-300'}`}
        >
          <Icon name="users" className="w-4.5 h-4.5" />
          <span className="text-[8px] uppercase tracking-wider font-extrabold text-center">Deudas</span>
        </button>

        {/* CENTER BUTTON FOR QUICK ACCESS: REGISTRAR OPERACION */}
        <button 
          type="button"
          onClick={() => setIsTransModalOpen(true)}
          className="flex items-center justify-center bg-indigo-650 hover:bg-indigo-550 active:bg-indigo-755 text-white rounded-full h-11 w-11 shadow-lg shadow-indigo-600/35 transition-all border border-indigo-500/40 focus:outline-none shrink-0 -mt-5"
          title="Registrar Operación"
        >
          <Icon name="plus" className="w-6 h-6" />
        </button>

        <button 
          type="button"
          onClick={() => { setActiveTab('exchange'); }}
          className={`flex flex-col items-center gap-1 focus:outline-none ${activeTab === 'exchange' ? 'text-indigo-400 scale-[1.03] font-bold' : 'text-slate-455 hover:text-slate-300'}`}
        >
          <Icon name="refresh-cw" className="w-4.5 h-4.5" />
          <span className="text-[8px] uppercase tracking-wider font-extrabold text-center">Cambio</span>
        </button>

        <button 
          type="button"
          onClick={() => { setActiveTab('pagomovil'); }}
          className={`flex flex-col items-center gap-1 focus:outline-none ${activeTab === 'pagomovil' ? 'text-indigo-400 scale-[1.03] font-bold' : 'text-slate-455 hover:text-slate-300'}`}
        >
          <Icon name="smartphone" className="w-4.5 h-4.5" />
          <span className="text-[8px] uppercase tracking-wider font-extrabold text-center">Tpago</span>
        </button>

        <button 
          type="button"
          onClick={() => { setActiveTab('ledger'); }}
          className={`flex flex-col items-center gap-1 focus:outline-none ${activeTab === 'ledger' ? 'text-indigo-400 scale-[1.03] font-bold' : 'text-slate-455 hover:text-slate-300'}`}
        >
          <Icon name="list-ordered" className="w-4.5 h-4.5" />
          <span className="text-[8px] uppercase tracking-wider font-extrabold text-center">Historial</span>
        </button>
      </nav>

      {/* POPUP MODALS INJECTIONS */}
      {isTransModalOpen && (
        <TransactionModal 
          accounts={accounts}
          onClose={() => setIsTransModalOpen(false)}
          onSubmit={addTransaction}
        />
      )}

      {isAccModalOpen && (
        <AccountModal 
          editingAccount={editingAccount}
          onClose={() => { setIsAccModalOpen(false); setEditingAccount(null); }}
          onSubmit={saveAccount}
        />
      )}

      {isDebtModalOpen && (
        <DebtModal 
          editingDebt={editingDebt}
          onClose={() => { setIsDebtModalOpen(false); setEditingDebt(null); }}
          onSubmit={saveDebt}
        />
      )}

      {/* MONTH END / CIERRE DE MES MODAL */}
      {isMonthEndModalOpen && (
        <div id="month-end-sweep-modal" className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[65] flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="absolute inset-0" onClick={() => setIsMonthEndModalOpen(false)}></div>
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 relative z-10 animate-slide-up flex flex-col gap-4 shadow-2xl overflow-y-auto max-h-[90vh] custom-scroll">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="calendar-check" className="w-5 h-5 text-indigo-400" />
                <h3 className="font-display font-black text-sm text-white uppercase tracking-wider">Cierre de Mes Opcional</h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsMonthEndModalOpen(false)}
                className="p-1 px-2 hover:bg-slate-850 text-slate-500 hover:text-white rounded-lg transition-all focus:outline-none"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Consolida el saldo neto de tus cuentas corrientes en una cuenta de <strong className="text-white">Ahorro</strong> y reinicia los presupuestos para el nuevo período de forma limpia.
            </p>

            <div className="bg-slate-950/65 border border-slate-850 p-4 rounded-2xl flex flex-col gap-3">
              <span className="text-[9px] font-black uppercase text-indigo-404 tracking-wider">Simulación de Traspaso a Ahorros</span>
              
              <div className="flex flex-col gap-2 divide-y divide-slate-850 max-h-40 overflow-y-auto custom-scroll">
                {accounts.filter(a => a.balance > 0 && a.type !== 'savings').length === 0 ? (
                  <div className="text-[11px] text-slate-500 italic py-1 text-center">No hay saldos positivos corrientes para trasladar.</div>
                ) : (
                  accounts.filter(a => a.balance > 0 && a.type !== 'savings').map(acc => (
                    <div key={acc.id} className="flex justify-between items-center text-xs py-1.5 first:pt-0">
                      <span className="text-slate-450">{acc.name}</span>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="text-slate-500 line-through">{formatCurrencyVal(acc.balance, acc.currency)}</span>
                        <span className="text-slate-600">&rarr;</span>
                        <span className="text-emerald-400 font-extrabold">0.00</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {(() => {
                let usdSum = 0;
                let vesSum = 0;
                accounts.filter(a => a.balance > 0 && a.type !== 'savings').forEach(a => {
                  if (a.currency === 'USD') usdSum += a.balance;
                  else vesSum += a.balance;
                });
                
                if (usdSum === 0 && vesSum === 0) return null;
                
                return (
                  <div className="mt-2 pt-2.5 border-t border-slate-850 flex flex-col gap-1.5">
                    <span className="text-[8px] font-black uppercase text-slate-505">Monto total a sumarse en tu Ahorro:</span>
                    <div className="flex flex-col gap-1">
                      {usdSum > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-350 font-medium">Acumular en Ahorro ($):</span>
                          <span className="font-mono text-emerald-450 font-black">+{formatCurrencyVal(usdSum, 'USD')}</span>
                        </div>
                      )}
                      {vesSum > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-350 font-medium">Acumular en Ahorro (Bs):</span>
                          <span className="font-mono text-emerald-450 font-black">+{formatCurrencyVal(vesSum, 'VES')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="bg-slate-950/25 border border-slate-850 p-4 rounded-2xl flex flex-col gap-3">
              <span className="text-[9px] font-black uppercase text-slate-450 tracking-wider">Opciones de Limpieza</span>
              
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={cleanMonthEndLedger}
                  onChange={(e) => setCleanMonthEndLedger(e.target.checked)}
                  className="mt-0.5 rounded border-slate-800 bg-slate-900 text-indigo-600 focus:ring-0 focus:ring-offset-0 pointer-events-auto" 
                />
                <div className="flex flex-col">
                  <span className="text-xs text-slate-200 font-bold">Limpiar historial de transacciones (Opcional)</span>
                  <span className="text-[10px] text-slate-505 mt-0.5 leading-snug">Si se activa, vacía la tabla/historial de transacciones para iniciar el nuevo mes desde cero, respaldando el saldo neto positivo.</span>
                </div>
              </label>

              <div className="mt-1 border-t border-slate-850 pt-3">
                <div className="flex items-center gap-1.5">
                  <Icon name="shield-check" className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[10px] font-black uppercase text-indigo-405">Protección Activa de Deudas</span>
                </div>
                <p className="text-[10px] text-slate-505 mt-1 leading-snug">
                  Las deudas y cobros pendientes (<strong className="text-indigo-300 font-bold">{debts.filter(d => d.status === 'pending').length} activas</strong>) quedarán intactas y seguras. Se limpiarán únicamente las deudas ya cobradas/pagadas.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => setIsMonthEndModalOpen(false)}
                className="py-2.5 bg-slate-955 hover:bg-slate-850 border border-slate-800 rounded-xl font-bold text-xs text-slate-350 active:scale-95 transition-all focus:outline-none cursor-pointer"
              >
                No, cancelar
              </button>
              <button
                type="button"
                onClick={() => executeMonthEndClose(cleanMonthEndLedger)}
                className="py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-lg active:scale-95 transition-all focus:outline-none flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Icon name="sparkles" className="w-3.5 h-3.5" />
                <span>Ejecutar Cierre</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROFILE SETTINGS & AVATAR CONFIGURATION MODAL */}
      {isProfileSettingsOpen && (
        <div id="profile-settings-modal" className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="absolute inset-0" onClick={() => setIsProfileSettingsOpen(false)}></div>
          <div className="w-full max-w-sm bg-slate-900 border border-slate-850/80 rounded-3xl p-6 relative z-10 animate-slide-up flex flex-col gap-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-black text-sm text-white uppercase tracking-wider">Manejo de Perfil</h3>
              <button 
                type="button"
                onClick={() => setIsProfileSettingsOpen(false)}
                className="p-1 px-2 hover:bg-slate-855 text-slate-500 hover:text-white rounded-lg transition-all focus:outline-none"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3.5 p-3.5 bg-slate-950/60 border border-slate-855/50 rounded-2xl">
              <div className="w-14 h-14 rounded-full bg-slate-850 border border-slate-750 flex items-center justify-center text-3xl shrink-0 shadow-inner">
                {currentUser.avatar}
              </div>
              <div className="min-w-0 flex-1">
                <span className="block font-black text-sm text-white truncate">{currentUser.username}</span>
                <span className="block text-[10px] text-slate-450 truncate mt-0.5">{currentUser.email}</span>
                <span className="block text-[8px] text-slate-600 font-mono mt-1 font-bold">Creado: {currentUser.createdAt ? new Date(currentUser.createdAt).toLocaleDateString() : 'Recientemente'}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase font-bold text-slate-550 tracking-wider">Personalizar Avatar</span>
              <div className="grid grid-cols-6 gap-2 p-2 bg-slate-950/40 border border-slate-850/60 rounded-xl max-h-[105px] overflow-y-auto custom-scroll">
                {['💼', '💰', '💳', '🦁', '🦊', '🐉', '🚀', '💎', '🎨', '🧁', '⚽', '🎯', '🥑', '🍕', '🐱', '🐶'].map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleUpdateAvatarLocal(emoji)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-base transition-all hover:bg-slate-855 focus:outline-none active:scale-90 ${currentUser.avatar === emoji ? 'bg-indigo-650/30 border border-indigo-500/50 text-white scale-[1.1]' : 'border border-transparent'}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5 mt-1">
              <button
                type="button"
                onClick={handleExportTransactionsExcel}
                className="w-full py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 hover:border-emerald-500/40 rounded-xl font-bold text-xs text-emerald-405 active:scale-95 transition-all focus:outline-none flex items-center justify-center gap-2 cursor-pointer"
              >
                <Icon name="file-spreadsheet" className="w-3.5 h-3.5" />
                <span>Exportar a Excel (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onLogout();
                  setIsProfileSettingsOpen(false);
                }}
                className="w-full py-2.5 bg-slate-850 hover:bg-slate-800 border border-slate-800 rounded-xl font-bold text-xs text-slate-300 active:scale-95 transition-all focus:outline-none flex items-center justify-center gap-2 cursor-pointer"
              >
                <Icon name="log-out" className="w-3.5 h-3.5 text-rose-455" />
                <span>Cerrar Sesión</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsConfirmDeleteOpen(true);
                }}
                className="w-full py-2.5 bg-rose-955/20 hover:bg-rose-950/45 border border-rose-900/30 hover:border-rose-900/60 rounded-xl font-bold text-xs text-rose-455 active:scale-95 transition-all focus:outline-none flex items-center justify-center gap-2 cursor-pointer"
              >
                <Icon name="trash-2" className="w-3.5 h-3.5 animate-pulse" />
                <span>Eliminar Cuenta</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isConfirmDeleteOpen && (
        <div id="confirm-delete-account-modal" className="fixed inset-0 bg-black/85 backdrop-blur-md z-[70] flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="absolute inset-0" onClick={() => setIsConfirmDeleteOpen(false)}></div>
          <div className="w-full max-w-sm bg-slate-950 border border-rose-950 rounded-3xl p-6 relative z-10 animate-scale-up flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                <Icon name="alert-triangle" className="w-5 h-5 text-rose-500 animate-bounce" />
              </div>
              <div>
                <h3 className="font-display font-black text-sm text-white">¿Eliminar Perfil?</h3>
                <p className="text-[9px] text-rose-550 font-bold uppercase tracking-wider font-mono">Acción Irreversible</p>
              </div>
            </div>
            
            <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-900 p-3.5 rounded-2xl border border-slate-850">
              Esta acción es permanente. Se eliminará tu perfil (<strong className="text-white">{currentUser.username}</strong>) junto con todo tu historial de este dispositivo, incluyendo <strong className="text-white">cuentas, transacciones y deudas</strong>. No podrás recuperar estos datos.
            </p>
            
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => setIsConfirmDeleteOpen(false)}
                className="py-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl font-bold text-xs text-slate-350 active:scale-95 transition-all focus:outline-none cursor-pointer"
              >
                No, cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteCurrentAccount}
                className="py-2.5 bg-rose-600 hover:bg-rose-700 rounded-xl font-bold text-xs text-white shadow-lg active:scale-95 transition-all focus:outline-none flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Icon name="trash-2" className="w-3.5 h-3.5" />
                <span>Borrar Todo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isPassModalOpen && (
        <PasswordConfirmationModal 
          onConfirm={confirmAccountDeletion}
          onClose={() => setIsPassModalOpen(false)}
        />
      )}

      {showPwaInstructions && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-5 shadow-2xl relative select-none animate-slide-up">
            <button
              type="button"
              onClick={() => setShowPwaInstructions(false)}
              className="absolute right-4 top-4 p-1 px-2 text-slate-550 hover:text-white rounded-lg bg-slate-950 focus:outline-none cursor-pointer"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
            
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-605/10 border border-indigo-550/20 text-indigo-400 flex items-center justify-center">
                <Icon name="smartphone" className="w-6 h-6 animate-pulse-slow" />
              </div>
              <div>
                <h3 className="font-display font-black text-sm text-white">Instalar en tu Dispositivo</h3>
                <p className="text-[11px] text-slate-400 mt-1">Lleva el control de tus cuentas directamente desde la pantalla de inicio.</p>
              </div>
            </div>

            <div className="flex flex-col gap-3.5 mt-2 bg-slate-955/50 p-4 rounded-2xl border border-slate-850/50 text-[11px]">
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-850 border border-slate-800 text-indigo-400 font-black text-xs flex items-center justify-center shrink-0">1</div>
                <div>
                  <span className="font-bold text-white block">En iOS (Safari):</span>
                  <span className="text-slate-400 mt-0.5 block">Toca el botón <b className="text-indigo-455 font-bold">Compartir</b> en Safari y selecciona <b className="text-indigo-455 font-bold">"Agregar a Pantalla de Inicio"</b>.</span>
                </div>
              </div>

              <div className="flex gap-3 border-t border-slate-850/40 pt-3">
                <div className="w-6 h-6 rounded-full bg-slate-850 border border-slate-800 text-indigo-400 font-black text-xs flex items-center justify-center shrink-0">2</div>
                <div>
                  <span className="font-bold text-white block">En Android / Chrome:</span>
                  <span className="text-slate-400 mt-0.5 block">Toca el menú secreto de <b className="text-indigo-455 font-bold">tres puntos</b> en la esquina de Chrome y selecciona <b className="text-indigo-455 font-bold">"Instalar aplicación"</b>.</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowPwaInstructions(false)}
              className="py-2.5 w-full bg-indigo-605 hover:bg-indigo-700 font-bold text-xs text-white rounded-xl transition-all shadow-lg select-none cursor-pointer text-center"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {isStatementUploaderOpen && (
        <BankStatementUploader 
          accounts={accounts}
          transactions={transactions}
          onImport={(trans) => {
            addGroupTransactions(trans);
          }}
          onClose={() => setIsStatementUploaderOpen(false)}
        />
      )}

    </div>
  );
}
