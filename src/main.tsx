import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Intercept and silently suppress benign environment-specific WebSocket HMR connection errors
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason && (
      (typeof reason === 'string' && reason.toLowerCase().includes('websocket')) ||
      (reason.message && reason.message.toLowerCase().includes('websocket')) ||
      (reason.stack && reason.stack.toLowerCase().includes('websocket'))
    )) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  window.addEventListener('error', (event) => {
    if (event.message && (
      event.message.toLowerCase().includes('websocket') ||
      event.message.toLowerCase().includes('vite')
    )) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
