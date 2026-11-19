import React from 'react';
import { createRoot } from 'react-dom/client';
import '@nightfall/ui-kit/styles.css';
import { NightfallShowcaseRoot } from './nightfall-showcase-root.js';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <NightfallShowcaseRoot />
    </React.StrictMode>,
  );
}
