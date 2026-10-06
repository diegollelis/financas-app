/**
 * The last workspace opened in this browser, so "/" goes straight back to it (ADR 0036). A
 * convenience only: storage can be missing or throw (private windows, blocked site data), and
 * then "/" falls back to the personal workspace.
 */
const LAST_WORKSPACE_KEY = 'financas-ultimo-espaco';

export function readLastWorkspace(): string | null {
  try {
    return window.localStorage.getItem(LAST_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

export function rememberLastWorkspace(workspaceId: string) {
  try {
    window.localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId);
  } catch {
    // Not saved: "/" opens the personal workspace instead.
  }
}
