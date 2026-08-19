import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import { initAnalytics } from './analytics.js';
import './styles.css';

initAnalytics();

const container = document.getElementById('root');
if (!container) throw new Error('Could not find the #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
