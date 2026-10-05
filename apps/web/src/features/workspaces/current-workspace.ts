import type { Workspace } from '@financas/shared';
import { createContext, useContext } from 'react';

export const CurrentWorkspaceContext = createContext<Workspace | null>(null);

/**
 * The workspace of the page, loaded once by `WorkspaceLayout`. Pages under it render only after
 * the workspace loaded, so they never handle its loading, 404 or error states themselves.
 */
export function useCurrentWorkspace(): Workspace {
  const workspace = useContext(CurrentWorkspaceContext);
  if (!workspace) throw new Error('useCurrentWorkspace must be used under WorkspaceLayout');
  return workspace;
}
