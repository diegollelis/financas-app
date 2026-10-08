import {
  ACCOUNT_DELETED_PATH,
  ACCOUNT_PATH,
  DELETE_ACCOUNT_PATH,
  FORGOT_PASSWORD_PATH,
  INVITATION_PATH,
  PRIVACY_PATH,
  RESET_PASSWORD_PATH,
  SIGN_IN_PATH,
  TERMS_PATH,
} from '@financas/shared';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { RootLayout } from '@/components/root-layout';
import { GuestOnly, RequireAuth } from '@/features/auth/route-guards';
import { WorkspaceLayout } from '@/features/workspaces/workspace-layout';
import { AnalysisPage } from '@/routes/analysis';
import { ImportPage } from '@/routes/import';
import { RecurrencesPage } from '@/routes/recurrences';
import { BudgetPage } from '@/routes/budget';
import { CategoriesPage } from '@/routes/categories';
import { DashboardPage } from '@/routes/dashboard';
import { ForgotPasswordPage } from '@/routes/forgot-password';
import { HomePage } from '@/routes/home';
import { InvitationPage } from '@/routes/invitation';
import { AccountPage } from '@/routes/account';
import { AccountDeletedPage } from '@/routes/account-deleted';
import { DeleteAccountPage } from '@/routes/delete-account';
import { PeoplePage } from '@/routes/people';
import { PrivacyPage } from '@/routes/privacy';
import { TermsPage } from '@/routes/terms';
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
          { path: ACCOUNT_PATH, element: <AccountPage /> },
          { path: DELETE_ACCOUNT_PATH, element: <DeleteAccountPage /> },
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
              // A dashboard of blocks side by side: the wide column (ADR 0045).
              { path: 'painel', element: <DashboardPage />, handle: { wide: true } },
              // The range and filters travel in the address (ADR 0037).
              { path: 'analise', element: <AnalysisPage /> },
              // Recurrences and installment plans (ADR 0038).
              { path: 'recorrencias', element: <RecurrencesPage /> },
              { path: 'pessoas', element: <PeoplePage /> },
              // The spreadsheet is read in the browser; only confirmed rows go out (ADR 0040).
              { path: 'importar', element: <ImportPage /> },
            ],
          },
        ],
      },
      // Outside the guards: the e-mail link works whether or not someone is signed in here.
      { path: RESET_PASSWORD_PATH, element: <ResetPasswordPage /> },
      { path: `${INVITATION_PATH}/:token`, element: <InvitationPage /> },
      // Public: Google's consent screen links here (ADR 0026).
      { path: PRIVACY_PATH, element: <PrivacyPage /> },
      { path: TERMS_PATH, element: <TermsPage /> },
      { path: ACCOUNT_DELETED_PATH, element: <AccountDeletedPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
