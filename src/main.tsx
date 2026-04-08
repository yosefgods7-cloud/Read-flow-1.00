import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log('App starting...');

const rootEl = document.getElementById('root');
if (rootEl) {
  rootEl.innerHTML = '<div style="color: white; background-color: #09090b; height: 100vh; width: 100vw; display: flex; align-items: center; justify-content: center; font-family: sans-serif;">Loading app...</div>';
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} else {
  console.error('Root element not found');
}
