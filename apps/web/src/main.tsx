import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { errorReportingRootOptions, initErrorReporting } from './lib/error-reporting';
import { createQueryClient } from './lib/query-client';
import { router } from './router';
import './index.css';

// Before anything renders, so errors from the first render are reported too (ADR 0034).
initErrorReporting();

const queryClient = createQueryClient();

const root = document.getElementById('root');
if (!root) throw new Error('Element #root not found in index.html');

createRoot(root, errorReportingRootOptions()).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
