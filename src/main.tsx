import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Intercept and suppress benign Firestore SDK internal connection cancellation logs
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = function (...args) {
    const message = args
      .map((arg) => {
        if (arg instanceof Error) return arg.stack || arg.message;
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');

    if (
      message.includes('CANCELLED: Call cancelled') ||
      message.includes('GrpcConnection RPC \'Listen\' stream') ||
      (message.includes('@firebase/firestore') && message.includes('CANCELLED'))
    ) {
      // Suppress benign internal Firestore SDK logging noise when unsubscription/cancellation happens
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
