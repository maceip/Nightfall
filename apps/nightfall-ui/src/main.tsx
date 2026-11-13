import React from 'react';
import { createRoot } from 'react-dom/client';
import '@nightfall/ui-kit/styles.css';
import { App } from './App.js';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
