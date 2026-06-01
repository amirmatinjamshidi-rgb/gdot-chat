export class AppLockStore {
  isUnlocked = false;
  private backgroundTimer: ReturnType<typeof setTimeout> | null = null;
  private onLockCallbacks: (() => void)[] = [];

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
    this.clearBackgroundTimer();
  }

  onBackground(lockAfterMs: number): void {
    this.clearBackgroundTimer();
    this.backgroundTimer = setTimeout(() => {
      this.lock();
    }, lockAfterMs);
  }

  onForeground(): void {
    this.clearBackgroundTimer();
  }

  private clearBackgroundTimer(): void {
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer);
      this.backgroundTimer = null;
    }
  }
}

export const appLockStore = new AppLockStore();
