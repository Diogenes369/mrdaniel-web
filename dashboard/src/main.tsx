import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

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
