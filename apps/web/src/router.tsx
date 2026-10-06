import {
  FORGOT_PASSWORD_PATH,
  INVITATION_PATH,
  RESET_PASSWORD_PATH,
  SIGN_IN_PATH,
} from '@financas/shared';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { RootLayout } from '@/components/root-layout';
import { GuestOnly, RequireAuth } from '@/features/auth/route-guards';
import { WorkspaceLayout } from '@/features/workspaces/workspace-layout';
import { AnalysisPage } from '@/routes/analysis';
import { RecurrencesPage } from '@/routes/recurrences';
import { BudgetPage } from '@/routes/budget';
import { CategoriesPage } from '@/routes/categories';
import { DashboardPage } from '@/routes/dashboard';
import { ForgotPasswordPage } from '@/routes/forgot-password';
import { HomePage } from '@/routes/home';
import { InvitationPage } from '@/routes/invitation';
import { PrivacyPage } from '@/routes/privacy';
import { ResetPasswordPage } from '@/routes/reset-password';
import { SignInPage } from '@/routes/sign-in';
import { SignUpPage } from '@/routes/sign-up';
import { TransactionsPage } from '@/routes/transactions';
import { WorkspacePage } from '@/routes/workspace';

// Paths are UI text, so they are pt-BR (ADR 0021); component names stay in English.
export const routes: RouteObject[] = [
  {
    // Toasts for every page.
    element: <RootLayout />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: SIGN_IN_PATH, element: <SignInPage /> },
          { path: '/cadastro', element: <SignUpPage /> },
          { path: FORGOT_PASSWORD_PATH, element: <ForgotPasswordPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          { path: '/', element: <HomePage /> },
          {
            // Header, sections nav and the workspace loaded once for every page below (ADR 0036).
            path: '/espacos/:workspaceId',
            element: <WorkspaceLayout />,
            children: [
              { index: true, element: <WorkspacePage /> },
              { path: 'categorias', element: <CategoriesPage /> },
              // The competência travels as ?competencia=YYYY-MM (default: this month).
              { path: 'lancamentos', element: <TransactionsPage /> },
              { path: 'orcamento', element: <BudgetPage /> },
              { path: 'painel', element: <DashboardPage /> },
              // The range and filters travel in the address (ADR 0037).
              { path: 'analise', element: <AnalysisPage /> },
              // Recurrences and installment plans (ADR 0038).
              { path: 'recorrencias', element: <RecurrencesPage /> },
            ],
          },
        ],
      },
      // Outside the guards: the e-mail link works whether or not someone is signed in here.
      { path: RESET_PASSWORD_PATH, element: <ResetPasswordPage /> },
      { path: `${INVITATION_PATH}/:token`, element: <InvitationPage /> },
      // Public: Google's consent screen links here (ADR 0026).
      { path: '/privacidade', element: <PrivacyPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
