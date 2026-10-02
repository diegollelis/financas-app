import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '@/router';

/** A fresh client per test, without retries, keeps tests fast and independent. */
function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Renders a component with the app providers. */
export function renderWithProviders(ui: ReactElement) {
  return render(<QueryClientProvider client={createTestQueryClient()}>{ui}</QueryClientProvider>);
}

/** Renders the whole app (real routes and guards) starting at `path`. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}
