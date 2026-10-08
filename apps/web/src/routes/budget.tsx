import { Navigate, useLocation } from 'react-router';

/**
 * The budget page became a dialog on the dashboard (ADR 0046). Bookmarks and the browser's
 * history still point here: they land on the dashboard of the same competência.
 */
export function BudgetRedirect() {
  const { search } = useLocation();
  return <Navigate to={`../painel${search}`} replace />;
}
