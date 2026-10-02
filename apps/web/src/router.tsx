import { INVITATION_PATH, RESET_PASSWORD_PATH } from '@financas/shared';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { GuestOnly, RequireAuth } from '@/features/auth/route-guards';
import { CategoriesPage } from '@/routes/categories';
import { ForgotPasswordPage } from '@/routes/forgot-password';
import { HomePage } from '@/routes/home';
import { InvitationPage } from '@/routes/invitation';
import { ResetPasswordPage } from '@/routes/reset-password';
import { SignInPage } from '@/routes/sign-in';
import { SignUpPage } from '@/routes/sign-up';
import { WorkspacePage } from '@/routes/workspace';

// Paths are UI text, so they are pt-BR (ADR 0021); component names stay in English.
export const routes: RouteObject[] = [
  {
    element: <GuestOnly />,
    children: [
      { path: '/entrar', element: <SignInPage /> },
      { path: '/cadastro', element: <SignUpPage /> },
      { path: '/esqueci-senha', element: <ForgotPasswordPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/espacos/:workspaceId', element: <WorkspacePage /> },
      { path: '/espacos/:workspaceId/categorias', element: <CategoriesPage /> },
    ],
  },
  // Outside the guards: the e-mail link works whether or not someone is signed in here.
  { path: RESET_PASSWORD_PATH, element: <ResetPasswordPage /> },
  { path: `${INVITATION_PATH}/:token`, element: <InvitationPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
];

export const router = createBrowserRouter(routes);
