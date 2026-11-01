import { AppAuthError } from "@/lib/auth/app-auth-error";

export type Clock = () => number;

/** Escalating lockout after failed PIN unlocks (ms). Index = failure count after this failure. */
export const PIN_LOCKOUT_SCHEDULE_MS = [
  0,
  0,
  1_000,
  2_000,
  5_000,
  15_000,
  60_000,
  5 * 60_000,
] as const;

export type PinLockoutState = {
  failedCount: number;
  lockedUntil: number;
};

export function emptyPinLockoutState(): PinLockoutState {
  return { failedCount: 0, lockedUntil: 0 };
}

export function assertPinUnlockAllowed(
  state: PinLockoutState,
  now: number = Date.now(),
): void {
  if (state.lockedUntil > now) {
    const waitSec = Math.ceil((state.lockedUntil - now) / 1000);
    throw new AppAuthError(
      "LOCKOUT",
      `Too many failed PIN attempts. Try again in ${waitSec}s.`,
    );
  }
}

export function registerPinFailure(
  state: PinLockoutState,
  now: number = Date.now(),
): PinLockoutState {
  const failedCount = state.failedCount + 1;
  const idx = Math.min(failedCount, PIN_LOCKOUT_SCHEDULE_MS.length - 1);
  const delay = PIN_LOCKOUT_SCHEDULE_MS[idx] ?? PIN_LOCKOUT_SCHEDULE_MS.at(-1)!;
  return {
    failedCount,
    lockedUntil: delay > 0 ? now + delay : 0,
  };
}

export function registerPinSuccess(): PinLockoutState {
  return emptyPinLockoutState();
}

export function parsePinLockoutState(raw: string | null): PinLockoutState {
  if (!raw) return emptyPinLockoutState();
  try {
    const parsed = JSON.parse(raw) as Partial<PinLockoutState>;
    if (
      typeof parsed.failedCount !== "number" ||
      typeof parsed.lockedUntil !== "number"
    ) {
      return emptyPinLockoutState();
    }
    return {
      failedCount: Math.max(0, Math.floor(parsed.failedCount)),
      lockedUntil: Math.max(0, Math.floor(parsed.lockedUntil)),
    };
  } catch {
    return emptyPinLockoutState();
  }
}

export function serializePinLockoutState(state: PinLockoutState): string {
  return JSON.stringify(state);
}
