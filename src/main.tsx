import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import App from './App.tsx';
import { initDebugConsoleIfRequested } from './lib/debugConsole';
import { initA11y } from './lib/a11yStore';
import { initPerfMode } from './lib/perfMode';
import './index.css';

initDebugConsoleIfRequested();
initPerfMode(); // classify the device before first paint so CSS never renders the heavy variant first
initA11y(); // apply any saved accessibility prefs before first paint, to avoid a flash of unstyled content

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
