/**
 * Ordered app-lock teardown: stop sync/SignalR (and abort in-flight HTTP) before
 * closing the encrypted DB so native statements are not finalized against a closed handle.
 */
export type LockShutdownDeps = {
  stopSync: () => Promise<void>;
  closeDb: () => Promise<void>;
};

export async function runLockShutdown(deps: LockShutdownDeps): Promise<void> {
  try {
    await deps.stopSync();
  } catch {
    /* stop best-effort; still close DB */
  }
  try {
    await deps.closeDb();
  } catch {
    /* idempotent close may still throw from native; ignore */
  }
}
