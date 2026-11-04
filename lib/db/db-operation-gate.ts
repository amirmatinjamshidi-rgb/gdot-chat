import { DbLockedError } from "./db-errors";

/**
 * Serializes DB work, tracks in-flight outermost ops, and rejects new work with
 * {@link DbLockedError} once closing has begun. {@link closeExclusive} waits for
 * in-flight ops before running the native close.
 */
export class DbOperationGate {
  private acceptingOps = true;
  private inFlight = 0;
  private drainWaiters: Array<() => void> = [];
  private mutex: Promise<void> = Promise.resolve();
  private depth = 0;

  /** Allow ops again after a successful open. */
  markOpen(): void {
    this.acceptingOps = true;
  }

  isAccepting(): boolean {
    return this.acceptingOps;
  }

  getInFlightCount(): number {
    return this.inFlight;
  }

  private notifyDrain(): void {
    if (this.inFlight !== 0) return;
    const waiters = this.drainWaiters;
    this.drainWaiters = [];
    for (const w of waiters) w();
  }

  private waitForDrain(): Promise<void> {
    if (this.inFlight === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.drainWaiters.push(resolve);
    });
  }

  /**
   * Run an operation under the serialize mutex. Nested calls (depth > 0) re-enter
   * without taking the mutex again (for withTransaction).
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.depth > 0) {
      return fn();
    }

    const previous = this.mutex;
    let release!: () => void;
    this.mutex = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    this.depth += 1;
    this.inFlight += 1;
    try {
      if (!this.acceptingOps) {
        throw new DbLockedError();
      }
      return await fn();
    } finally {
      this.inFlight -= 1;
      this.depth -= 1;
      this.notifyDrain();
      release();
    }
  }

  /**
   * Stop accepting new ops, wait for in-flight work, then run closeFn under the mutex.
   * Idempotent when closeFn is a no-op for an already-closed handle.
   */
  async closeExclusive(closeFn: () => Promise<void>): Promise<void> {
    this.acceptingOps = false;
    await this.waitForDrain();

    const previous = this.mutex;
    let release!: () => void;
    this.mutex = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    this.depth += 1;
    try {
      await closeFn();
    } finally {
      this.depth -= 1;
      release();
    }
  }
}
