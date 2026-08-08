import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
// The design system must be imported before App, so that page-level CSS —
// which loads transitively via App's imports — comes after it in the bundle
// and can override a primitive at equal specificity.
import './styles.css';
import { App } from './App';
import { GymProvider } from './data/store';
import { LanguageProvider } from './data/i18n';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <GymProvider>
        <App />
      </GymProvider>
    </LanguageProvider>
  </StrictMode>,
);
