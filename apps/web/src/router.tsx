import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { GuestOnly, RequireAuth } from '@/features/auth/route-guards';
import { HomePage } from '@/routes/home';
import { SignInPage } from '@/routes/sign-in';
import { SignUpPage } from '@/routes/sign-up';

// Paths are UI text, so they are pt-BR (ADR 0021); component names stay in English.
export const routes: RouteObject[] = [
  {
    element: <GuestOnly />,
    children: [
      { path: '/entrar', element: <SignInPage /> },
      { path: '/cadastro', element: <SignUpPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [{ path: '/', element: <HomePage /> }],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

export const router = createBrowserRouter(routes);
