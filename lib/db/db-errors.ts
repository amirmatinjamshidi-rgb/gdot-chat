/** Thrown when the DB is closing or closed for app lock. Callers should cancel quietly. */
export class DbLockedError extends Error {
  readonly code = "DB_LOCKED" as const;

  constructor(message = "DB_LOCKED") {
    super(message);
    this.name = "DbLockedError";
  }
}

export function isDbLockedError(error: unknown): boolean {
  if (error instanceof DbLockedError) return true;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "DB_LOCKED"
  ) {
    return true;
  }
  return false;
}

/**
 * True for lock/close races that sync, replenish, media, and retries should swallow.
 * Includes legacy expo-sqlite messages from closes that raced before the gate.
 */
export function isQuietDbCancel(error: unknown): boolean {
  if (isDbLockedError(error)) return true;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg === "DB not open" ||
    /access to closed resource/i.test(msg) ||
    /nativestatement\.finalizeasync/i.test(msg) ||
    /nativedatabase\.closeasync/i.test(msg)
  );
}
