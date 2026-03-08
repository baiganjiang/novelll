import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global error handler to help diagnose white screen issues on mobile
if (typeof window !== 'undefined') {
  window.onerror = function(message, source, lineno, colno, error) {
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '0';
    errorDiv.style.left = '0';
    errorDiv.style.width = '100%';
    errorDiv.style.height = '100%';
    errorDiv.style.backgroundColor = 'white';
    errorDiv.style.color = 'black';
    errorDiv.style.padding = '20px';
    errorDiv.style.zIndex = '9999';
    errorDiv.style.overflow = 'auto';
    errorDiv.innerHTML = `
      <h1 style="color: red; font-size: 20px;">Runtime Error</h1>
      <p><strong>Message:</strong> ${message}</p>
      <p><strong>Source:</strong> ${source}:${lineno}:${colno}</p>
      <pre style="background: #eee; padding: 10px; font-size: 12px;">${error?.stack || 'No stack trace'}</pre>
      <button onclick="location.reload()" style="padding: 10px; background: #007bff; color: white; border: none; border-radius: 5px; margin-top: 10px;">Reload App</button>
    `;
    document.body.appendChild(errorDiv);
    return false;
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
