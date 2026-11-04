export type AppStateLike = "active" | "background" | "inactive" | "unknown" | "extension";

/** Immediate lock only on real background; ignore inactive + in-progress unlock/OS dialogs. */
export function shouldLockOnAppStateChange(
  state: AppStateLike,
  opts: { unlockInProgress: boolean; suppressingBackgroundLock: boolean },
): boolean {
  if (state !== "background") return false;
  if (opts.unlockInProgress) return false;
  if (opts.suppressingBackgroundLock) return false;
  return true;
}

export class AppLockStore {
  isUnlocked = false;
  private onLockCallbacks: (() => void)[] = [];
  private suppressBackgroundLockCount = 0;

  onLock(cb: () => void): () => void {
    this.onLockCallbacks.push(cb);
    return () => {
      this.onLockCallbacks = this.onLockCallbacks.filter((x) => x !== cb);
    };
  }

  lock(): void {
    this.isUnlocked = false;
    for (const cb of this.onLockCallbacks) {
      cb();
    }
  }

  unlock(): void {
    this.isUnlocked = true;
  }

  /** Ignore AppState background locks (biometric dialog, file picker, camera). */
  beginSuppressBackgroundLock(): void {
    this.suppressBackgroundLockCount += 1;
  }

  endSuppressBackgroundLock(): void {
    this.suppressBackgroundLockCount = Math.max(
      0,
      this.suppressBackgroundLockCount - 1,
    );
  }

  isSuppressingBackgroundLock(): boolean {
    return this.suppressBackgroundLockCount > 0;
  }

  /**
   * App moved to background — lock immediately.
   * Callers must skip this while {@link isSuppressingBackgroundLock} is true
   * (and prefer listening only to AppState "background", not "inactive").
   */
  onBackground(_lockAfterMs?: number): void {
    if (this.suppressBackgroundLockCount > 0) return;
    this.lock();
  }

  onForeground(): void {
    // Immediate-lock policy: unlock only via explicit unlock / lock screen.
  }
}

export const appLockStore = new AppLockStore();
