import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import { installActivityTap } from './lib/agentActivity';

// Feeds the Mission Control arena: every API call this dashboard makes is classified into the
// Scout / Grok / Hermes agent it belongs to (see lib/agentActivity.ts).
installActivityTap();

// Root-level safety net — catches anything outside the per-tab boundaries inside App.tsx (the
// header, ExportControls, the auth-loading/LoginGate states) so literally nothing in this app can
// produce a fully blank/stuck dark screen with zero explanation.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary label="לוח הבקרה">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
