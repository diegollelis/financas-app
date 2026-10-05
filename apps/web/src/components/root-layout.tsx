import { Outlet } from 'react-router';
import { Toaster } from '@/components/ui/sonner';

/** Around every route: the toasts that confirm each change (ADR 0036). */
export function RootLayout() {
  return (
    <>
      <Outlet />
      {/* At the top: at the bottom they would cover the tab bar and the main action. */}
      <Toaster position="top-center" />
    </>
  );
}
