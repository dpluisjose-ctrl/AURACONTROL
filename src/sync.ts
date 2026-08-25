import { collection, doc, setDoc, deleteDoc, getDocs, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { AppUser, Account, Transaction, Debt } from './types';

// Load all users from Firestore
export async function fetchUsersFromFirestore(): Promise<AppUser[]> {
  const path = 'users';
  try {
    const snap = await getDocs(collection(db, path));
    const list: AppUser[] = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      list.push({
        id: docSnap.id,
        username: data.username || '',
        email: data.email || '',
        passwordHash: data.passwordHash || '',
        avatar: data.avatar || '',
        createdAt: data.createdAt || '',
      });
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

// Save user to Firestore
export async function saveUserToFirestore(user: AppUser): Promise<void> {
  const path = `users`;
  try {
    await setDoc(doc(db, path, user.id), {
      id: user.id,
      username: user.username,
      email: user.email,
      passwordHash: user.passwordHash,
      avatar: user.avatar,
      createdAt: user.createdAt,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${path}/${user.id}`);
  }
}

// Delete user from Firestore
export async function deleteUserFromFirestore(userId: string): Promise<void> {
  const path = `users/${userId}`;
  try {
    await deleteDoc(doc(db, 'users', userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Save exchange rate
export async function saveExchangeRateToFirestore(userId: string, rate: number): Promise<void> {
  const path = `users/${userId}`;
  try {
    await setDoc(doc(db, 'users', userId), { exchangeRate: rate }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Load exchange rate
export async function fetchExchangeRateFromFirestore(userId: string): Promise<number> {
  const path = `users/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) {
      return snap.data().exchangeRate ?? 36.50;
    }
    return 36.50;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

// Fetch all accounts
export async function fetchAccountsFromFirestore(userId: string): Promise<Account[]> {
  const path = `users/${userId}/accounts`;
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'accounts'));
    const list: Account[] = [];
    snap.forEach(d => {
      const data = d.data();
      list.push({
        id: d.id,
        name: data.name || '',
        type: data.type || 'debit',
        balance: data.balance ?? 0,
        limit: data.limit ?? 0,
        theme: data.theme || 'indigo',
        number: data.number || '0000',
        bank: data.bank || '',
        currency: data.currency || 'USD',
        dueDate: data.dueDate || undefined,
      });
    });
    return list;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, path);
  }
}

// Fetch all transactions
export async function fetchTransactionsFromFirestore(userId: string): Promise<Transaction[]> {
  const path = `users/${userId}/transactions`;
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'transactions'));
    const list: Transaction[] = [];
    snap.forEach(d => {
      const data = d.data();
      list.push({
        id: d.id,
        accountId: data.accountId || '',
        destinationAccountId: data.destinationAccountId || undefined,
        amount: data.amount ?? 0,
        type: data.type || 'expense',
        category: data.category || 'other',
        date: data.date || '',
        description: data.description || '',
      });
    });
    // Sort transactions by date descending, then id descending
    return list.sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, path);
  }
}

// Fetch all debts
export async function fetchDebtsFromFirestore(userId: string): Promise<Debt[]> {
  const path = `users/${userId}/debts`;
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'debts'));
    const list: Debt[] = [];
    snap.forEach(d => {
      const data = d.data();
      list.push({
        id: d.id,
        type: data.type || 'to_pay',
        person: data.person || '',
        amount: data.amount ?? 0,
        currency: data.currency || 'USD',
        dueDate: data.dueDate || undefined,
        description: data.description || '',
        status: data.status || 'pending',
      });
    });
    return list;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, path);
  }
}

// Fetch all past savings
export async function fetchPastSavingsFromFirestore(userId: string): Promise<any[]> {
  const path = `users/${userId}/pastSavings`;
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'pastSavings'));
    const list: any[] = [];
    snap.forEach(d => {
      const data = d.data();
      list.push({
        id: d.id,
        month: data.month || '',
        amountUSD: data.amountUSD ?? 0,
        amountVES: data.amountVES ?? 0,
        date: data.date || '',
      });
    });
    return list.sort((a, b) => b.date.localeCompare(a.date));
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, path);
  }
}

// Save/Update individual documents in Firestore
export async function saveAccountToFirestore(userId: string, account: Account): Promise<void> {
  const path = `users/${userId}/accounts/${account.id}`;
  try {
    await setDoc(doc(db, 'users', userId, 'accounts', account.id), {
      id: account.id,
      name: account.name,
      type: account.type,
      balance: account.balance,
      limit: account.limit,
      theme: account.theme,
      number: account.number,
      bank: account.bank,
      currency: account.currency,
      dueDate: account.dueDate || null,
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
}

export async function deleteAccountFromFirestore(userId: string, accountId: string): Promise<void> {
  const path = `users/${userId}/accounts/${accountId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'accounts', accountId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
}

export async function saveTransactionToFirestore(userId: string, transaction: Transaction): Promise<void> {
  const path = `users/${userId}/transactions/${transaction.id}`;
  try {
    await setDoc(doc(db, 'users', userId, 'transactions', transaction.id), {
      id: transaction.id,
      accountId: transaction.accountId,
      destinationAccountId: transaction.destinationAccountId || null,
      amount: transaction.amount,
      type: transaction.type,
      category: transaction.category,
      date: transaction.date,
      description: transaction.description,
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
}

export async function deleteTransactionFromFirestore(userId: string, transactionId: string): Promise<void> {
  const path = `users/${userId}/transactions/${transactionId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'transactions', transactionId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
}

export async function saveDebtToFirestore(userId: string, debt: Debt): Promise<void> {
  const path = `users/${userId}/debts/${debt.id}`;
  try {
    await setDoc(doc(db, 'users', userId, 'debts', debt.id), {
      id: debt.id,
      type: debt.type,
      person: debt.person,
      amount: debt.amount,
      currency: debt.currency,
      dueDate: debt.dueDate || null,
      description: debt.description || null,
      status: debt.status,
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
}

export async function deleteDebtFromFirestore(userId: string, debtId: string): Promise<void> {
  const path = `users/${userId}/debts/${debtId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'debts', debtId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
}

export async function savePastSavingToFirestore(userId: string, saving: any): Promise<void> {
  const path = `users/${userId}/pastSavings/${saving.id}`;
  try {
    await setDoc(doc(db, 'users', userId, 'pastSavings', saving.id), {
      id: saving.id,
      month: saving.month,
      amountUSD: saving.amountUSD,
      amountVES: saving.amountVES,
      date: saving.date,
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
}

export async function deletePastSavingFromFirestore(userId: string, savingId: string): Promise<void> {
  const path = `users/${userId}/pastSavings/${savingId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'pastSavings', savingId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, path);
  }
}
