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

/** After leaving or deleting a workspace: "/" must not try to open it again. */
export function forgetLastWorkspace(workspaceId: string) {
  try {
    if (window.localStorage.getItem(LAST_WORKSPACE_KEY) === workspaceId) {
      window.localStorage.removeItem(LAST_WORKSPACE_KEY);
    }
  } catch {
    // Nothing saved, nothing to forget.
  }
}

/**
 * The last workspace opened in this browser, if it is still one of the user's; else the personal.
 * Where "/" goes, and whose frame "Minha conta" opens in (ADR 0044, note of 2026-10-11).
 */
export function pickWorkspace<T extends { id: string; isPersonal: boolean }>(
  workspaces: T[],
): T | undefined {
  const last = readLastWorkspace();
  return (
    workspaces.find((workspace) => workspace.id === last) ??
    workspaces.find((workspace) => workspace.isPersonal) ??
    workspaces[0]
  );
}

export function rememberLastWorkspace(workspaceId: string) {
  try {
    window.localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId);
  } catch {
    // Not saved: "/" opens the personal workspace instead.
  }
}
