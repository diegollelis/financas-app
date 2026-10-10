// First: configures Zod before any module parses with it.
import './lib/zod-config';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { canonicalRedirect } from './lib/canonical-origin';
import { env } from './lib/env';
import { errorReportingRootOptions, initErrorReporting } from './lib/error-reporting';
import { createQueryClient } from './lib/query-client';
import { router } from './router';
import './index.css';

// At an old address (the *.pages.dev of before the own domain), go to the app's own and render
// nothing here: the API accepts sign-ins only from its address (ADR 0039).
const redirect = canonicalRedirect(window.location.href, env.VITE_CANONICAL_ORIGIN);
if (redirect) {
  window.location.replace(redirect);
} else {
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
}
