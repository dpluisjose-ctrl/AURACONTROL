import React, { useState, useEffect, useMemo } from 'react';
import { AppUser, DEFAULT_ACCOUNTS } from '../types';
import Icon from './Icon';
import { 
  fetchUsersFromFirestore, 
  saveUserToFirestore, 
  saveAccountToFirestore, 
  saveExchangeRateToFirestore 
} from '../sync';

interface LoginPortalProps {
  onLoginSuccess: (user: AppUser) => void;
}

const AVATAR_POOL = [
  { emoji: '💼', color: 'bg-indigo-500/10 border-indigo-505/20 text-indigo-400' },
  { emoji: '💰', color: 'bg-emerald-500/10 border-emerald-505/20 text-emerald-400' },
  { emoji: '💳', color: 'bg-rose-500/10 border-rose-505/20 text-rose-400' },
  { emoji: '🦁', color: 'bg-amber-500/10 border-amber-505/20 text-amber-400' },
  { emoji: '🦊', color: 'bg-orange-500/10 border-orange-505/20 text-orange-400' },
  { emoji: '🐉', color: 'bg-violet-500/10 border-violet-510/20 text-violet-400' },
  { emoji: '🚀', color: 'bg-cyan-500/10 border-cyan-505/20 text-cyan-400' },
  { emoji: '💎', color: 'bg-sky-500/10 border-sky-505/20 text-sky-400' },
];

export default function LoginPortal({ onLoginSuccess }: LoginPortalProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [isLoading, setIsLoading] = useState(false);
  
  // Existing registered users loaded from localStorage initially
  const [users, setUsers] = useState<AppUser[]>(() => {
    try {
      const local = localStorage.getItem('wallet_registered_users');
      return local ? JSON.parse(local) : [];
    } catch {
      return [];
    }
  });

  // Pull latest users list from Firestore on boot to support multi-device syncing
  useEffect(() => {
    async function loadDbUsers() {
      setIsLoading(true);
      try {
        const dbUsers = await fetchUsersFromFirestore();
        if (dbUsers && dbUsers.length > 0) {
          setUsers(dbUsers);
          localStorage.setItem('wallet_registered_users', JSON.stringify(dbUsers));
        }
      } catch (e) {
        console.error("No se pudieron cargar usuarios de la base de datos remota:", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadDbUsers();
  }, []);

  // If no registered users, default directly to Register to start onboarding
  useEffect(() => {
    if (!isLoading && users.length === 0) {
      setTab('register');
    }
  }, [users, isLoading]);

  // Form states
  const [loginEmailOrUser, setLoginEmailOrUser] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState('💼');

  // Fast profile lock screen mode
  const [selectedProfileUser, setSelectedProfileUser] = useState<AppUser | null>(null);
  const [quickPassword, setQuickPassword] = useState('');
  const [showQuickPassword, setShowQuickPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Persist registered users
  const saveUsersToStorage = (updatedUsers: AppUser[]) => {
    localStorage.setItem('wallet_registered_users', JSON.stringify(updatedUsers));
    setUsers(updatedUsers);
  };

  // Error clearing helper
  const handleClearStatus = () => {
    setErrorMsg('');
    setSuccessMsg('');
  };

  // Simple Base64-like hashing for a safe client-side password credential comparison
  const hashPassword = (password: string): string => {
    return btoa(password + '_secure_wallet_salt');
  };

  // Handle registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    handleClearStatus();

    const trimmedUsername = regUsername.trim();
    const trimmedEmail = regEmail.trim().toLowerCase();

    if (!trimmedUsername || !trimmedEmail || !regPassword) {
      setErrorMsg('Por favor completa todos los campos.');
      return;
    }

    if (trimmedUsername.length < 3) {
      setErrorMsg('El nombre de usuario debe tener al menos 3 caracteres.');
      return;
    }

    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setErrorMsg('Por favor ingresa un correo electrónico válido.');
      return;
    }

    if (regPassword.length < 4) {
      setErrorMsg('La contraseña debe tener al menos 4 caracteres.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    // Check if username or email is already taken
    const userExists = users.some(
      u => u.username.toLowerCase() === trimmedUsername.toLowerCase() || u.email === trimmedEmail
    );

    if (userExists) {
      setErrorMsg('El usuario o correo electrónico ya está registrado.');
      return;
    }

    setIsLoading(true);
    // Create new user profile
    const newUser: AppUser = {
      id: 'usr-' + Date.now(),
      username: trimmedUsername,
      email: trimmedEmail,
      passwordHash: hashPassword(regPassword),
      avatar: selectedAvatar,
      createdAt: new Date().toISOString()
    };

    // Initialise Default Accounts (a single Cuenta Principal starting at 0.00)
    const cleanDefaultAccount = {
      id: 'acc-' + Date.now(),
      name: 'Cuenta Principal',
      type: 'debit' as const,
      balance: 0.00,
      limit: 0,
      theme: 'indigo',
      number: '0000',
      bank: 'Billetera',
      currency: 'USD' as const,
    };

    try {
      // 1. Save core profile document to Firestore
      await saveUserToFirestore(newUser);
      // 2. Provision initial structures
      await saveAccountToFirestore(newUser.id, cleanDefaultAccount);
      await saveExchangeRateToFirestore(newUser.id, 36.50);

      // Save locals to prevent lag
      localStorage.setItem(`wallet_accounts_${newUser.id}`, JSON.stringify([cleanDefaultAccount]));
      localStorage.setItem(`wallet_transactions_${newUser.id}`, '[]');
      localStorage.setItem(`wallet_debts_${newUser.id}`, '[]');
      localStorage.setItem(`wallet_exchange_rate_${newUser.id}`, '36.50');
      
      const updatedUsers = [...users, newUser];
      saveUsersToStorage(updatedUsers);

      setSuccessMsg('¡Usuario registrado exitosamente en la nube!');
      
      // Clear registration fields
      setRegUsername('');
      setRegEmail('');
      setRegPassword('');
      setRegConfirmPassword('');
      
      // Switch to login tab and auto-fill
      setLoginEmailOrUser(trimmedUsername);
      setTab('login');
    } catch (err) {
      console.error(err);
      setErrorMsg('Error al escribir en la base de datos de Firestore. Reintenta.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle standard login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    handleClearStatus();

    const searchKey = loginEmailOrUser.trim().toLowerCase();
    const pwHash = hashPassword(loginPassword);

    if (!searchKey || !loginPassword) {
      setErrorMsg('Ingresa tus credenciales.');
      return;
    }

    const matchedUser = users.find(
      u => u.username.toLowerCase() === searchKey || u.email === searchKey
    );

    if (!matchedUser || matchedUser.passwordHash !== pwHash) {
      setErrorMsg('Correo/Usuario o contraseña incorrectos.');
      return;
    }

    // Log user in!
    onLoginSuccess(matchedUser);
  };

  // Handle quick login (from profile select)
  const handleQuickLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    handleClearStatus();

    if (!selectedProfileUser) return;

    const pwHash = hashPassword(quickPassword);
    if (selectedProfileUser.passwordHash !== pwHash) {
      setErrorMsg('Contraseña incorrecta.');
      return;
    }

    onLoginSuccess(selectedProfileUser);
  };

  return (
    <div id="login-portal-card" className="min-h-screen w-full bg-slate-950 flex flex-col justify-center items-center px-4 relative overflow-hidden font-sans select-none">
      
      {/* Decorative vector grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-35"></div>
      
      {/* Top ambient color glow */}
      <div className="absolute top-[-10%] left-[20%] right-[20%] h-[300px] w-[60%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[10%] h-[250px] w-[40%] rounded-full bg-violet-600/5 blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-900/40 border border-slate-850/60 rounded-3xl p-6 relative z-10 backdrop-blur-xl flex flex-col gap-5 shadow-2xl">
        
        {/* LOGO & HERO SECTION */}
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-violet-600 flex items-center justify-center shadow-xl shadow-indigo-600/25">
            <Icon name="wallet" className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="font-display font-black text-xl tracking-tight bg-gradient-to-r from-white via-indigo-100 to-slate-100 bg-clip-text text-transparent">
              Portal de Billetera
            </h2>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-1">
              Control Multiperfil Seguro
            </p>
          </div>
        </div>

        {/* FEEDBACK alerts */}
        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-450 rounded-2xl flex items-start gap-2.5 text-xs animate-fade-in">
            <Icon name="alert-circle" className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-tight font-medium text-[11px]">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl flex items-start gap-2.5 text-xs animate-fade-in">
            <Icon name="check-circle" className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-tight font-medium text-[11px]">{successMsg}</span>
          </div>
        )}

        {/* PROFILE LOCK SCREEN VIEW */}
        {selectedProfileUser ? (
          <div className="flex flex-col gap-4 animate-slide-up">
            <div className="flex flex-col items-center gap-2 mt-2">
              <div className="w-16 h-16 rounded-full border border-slate-700 bg-slate-800 flex items-center justify-center text-3xl shadow-inner relative">
                {selectedProfileUser.avatar}
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-indigo-600 border border-slate-900 flex items-center justify-center">
                  <Icon name="lock" className="w-3 h-3 text-white" />
                </div>
              </div>
              <div className="text-center">
                <h4 className="font-extrabold text-sm text-white">{selectedProfileUser.username}</h4>
                <p className="text-[10px] text-slate-400">{selectedProfileUser.email}</p>
              </div>
            </div>

            <form onSubmit={handleQuickLogin} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Contraseña de Perfil</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-slate-500">
                    <Icon name="key" className="w-4 h-4" />
                  </span>
                  <input
                    type={showQuickPassword ? 'text' : 'password'}
                    value={quickPassword}
                    onChange={(e) => setQuickPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950/60 border border-slate-850 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-505 transition-all text-center tracking-widest font-mono"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowQuickPassword(!showQuickPassword)}
                    className="absolute right-3 top-3 text-slate-550 hover:text-slate-350 focus:outline-none"
                  >
                    <Icon name={showQuickPassword ? 'eye-off' : 'eye'} className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProfileUser(null);
                    setQuickPassword('');
                    handleClearStatus();
                  }}
                  className="py-2.5 rounded-xl border border-slate-800 hover:bg-slate-850 font-bold text-xs text-slate-400 active:scale-95 transition-all focus:outline-none"
                >
                  Cambiar usuario
                </button>
                <button
                  type="submit"
                  className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-xs text-white shadow-lg active:scale-95 transition-all focus:outline-none flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Ingresar</span>
                  <Icon name="arrow-right" className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        ) : (
          <>
            {/* TAB CONTROLS (Only if we actually have some profiles registered) */}
            {users.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-850/50">
                <button
                  type="button"
                  onClick={() => { setTab('login'); handleClearStatus(); }}
                  className={`py-2 text-[10px] uppercase tracking-wider font-extrabold rounded-lg transition-all focus:outline-none ${tab === 'login' ? 'bg-slate-850 text-white shadow' : 'text-slate-500 hover:text-slate-400'}`}
                >
                  Iniciar Sesión
                </button>
                <button
                  type="button"
                  onClick={() => { setTab('register'); handleClearStatus(); }}
                  className={`py-2 text-[10px] uppercase tracking-wider font-extrabold rounded-lg transition-all focus:outline-none ${tab === 'register' ? 'bg-slate-850 text-white shadow' : 'text-slate-500 hover:text-slate-400'}`}
                >
                  Registrarse
                </button>
              </div>
            )}

            {/* LOGIN WINDOW */}
            {tab === 'login' && (
              <div className="flex flex-col gap-4 animate-fade-in">
                
                {/* EXISTING USER PROFILES TILE LIST */}
                {users.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Perfiles Registrados</span>
                    <div className="grid grid-cols-2 gap-2 max-h-[148px] overflow-y-auto custom-scroll pr-1.5">
                      {users.map(u => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setSelectedProfileUser(u);
                            handleClearStatus();
                          }}
                          className="flex items-center gap-2.5 p-2 bg-slate-950/40 hover:bg-slate-950/85 border border-slate-850 hover:border-indigo-500/40 rounded-xl transition-all text-left focus:outline-none"
                        >
                          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-lg border border-slate-700 shrink-0 select-none">
                            {u.avatar}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block font-black text-xs text-slate-200 truncate leading-none">{u.username}</span>
                            <span className="text-[8px] text-slate-500 font-bold tracking-tight truncate block mt-0.5 uppercase">Acceder</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-slate-850/40"></div>
                  <span className="flex-shrink mx-4 text-[9px] font-mono text-slate-650 uppercase font-black tracking-wider">o ingresar credenciales</span>
                  <div className="flex-grow border-t border-slate-850/40"></div>
                </div>

                <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Usuario o Correo</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-500">
                        <Icon name="user" className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        value={loginEmailOrUser}
                        onChange={(e) => setLoginEmailOrUser(e.target.value)}
                        placeholder="Ingresa tu usuario o correo"
                        className="w-full pl-9 pr-3 py-2 bg-slate-950/65 border border-slate-850 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Contraseña</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-500">
                        <Icon name="lock" className="w-4 h-4" />
                      </span>
                      <input
                        type={showLoginPassword ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-9 pr-9 py-2 bg-slate-950/65 border border-slate-850 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute right-3 top-2.5 text-slate-550 hover:text-slate-350 focus:outline-none"
                      >
                        <Icon name={showLoginPassword ? 'eye-off' : 'eye'} className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 mt-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-xs text-white shadow-lg active:scale-95 transition-all focus:outline-none flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Icon name="log-in" className="w-4 h-4" />
                    <span>Ingresar a Cuenta</span>
                  </button>
                </form>
              </div>
            )}

            {/* REGISTRATION WINDOW */}
            {tab === 'register' && (
              <form onSubmit={handleRegister} className="flex flex-col gap-3.5 animate-fade-in">
                
                {/* INFORMATIVE TITLE ON EMPTY ONBOARD */}
                {users.length === 0 && (
                  <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl text-center">
                    <p className="text-[10px] text-indigo-300 font-medium leading-relaxed">
                      💡 No hay perfiles registrados en este dispositivo. Crea tu primera cuenta para empezar.
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Nombre de Usuario</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-500">
                      <Icon name="user" className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="Ej: Duver_Art"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950/65 border border-slate-850 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Correo Electrónico</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-500">
                      <Icon name="mail" className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950/65 border border-slate-850 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Contraseña</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-500">
                        <Icon name="lock" className="w-4 h-4" />
                      </span>
                      <input
                        type={showRegPassword ? 'text' : 'password'}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full pl-9 pr-3 py-2 bg-slate-950/65 border border-slate-850 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Confirmar</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-500">
                        <Icon name="lock" className="w-4 h-4" />
                      </span>
                      <input
                        type="password"
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full pl-9 pr-3 py-2 bg-slate-950/65 border border-slate-850 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* AVATAR SELECTOR ROW */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Elige tu Avatar</span>
                    <span className="text-[10px] font-bold text-indigo-400">{selectedAvatar}</span>
                  </div>
                  <div className="flex justify-between items-center gap-1.5 p-1 bg-slate-950/40 border border-slate-850/60 rounded-2xl">
                    {AVATAR_POOL.map(a => (
                      <button
                        key={a.emoji}
                        type="button"
                        onClick={() => setSelectedAvatar(a.emoji)}
                        className={`w-8.5 h-8.5 rounded-full border flex items-center justify-center text-base transition-all focus:outline-none active:scale-90 ${a.color} ${selectedAvatar === a.emoji ? 'border-pink-500 bg-pink-500/20 scale-[1.12]' : 'border-transparent select-none'}`}
                      >
                        {a.emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 mt-1">
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-650 to-violet-650 hover:from-indigo-600 hover:to-violet-600 font-bold text-xs text-white shadow-xl active:scale-95 transition-all focus:outline-none flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Icon name="user-plus" className="w-4 h-4" />
                    <span>Crear Mi Perfil</span>
                  </button>

                  {users.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setTab('login'); handleClearStatus(); }}
                      className="w-full py-2 rounded-xl text-slate-450 hover:text-slate-300 font-medium text-[11px] hover:bg-slate-850/30 transition-all focus:outline-none"
                    >
                      Regresar al inicio de sesión
                    </button>
                  )}
                </div>
              </form>
            )}
          </>
        )}

        {/* Security watermark footer */}
        <div className="flex items-center justify-center gap-1.5 text-slate-600 text-[10px] select-none font-mono mt-1 pt-3 border-t border-slate-850/30">
          <Icon name="shield" className="w-3.5 h-3.5 text-indigo-500/45" />
          <span>Acceso Multiperfil Cifrado Localmente</span>
        </div>

      </div>
    </div>
  );
}
