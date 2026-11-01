import { describe, expect, it } from "vitest";

import { AppAuthError } from "@/lib/auth/app-auth-error";

import {
  assertPinUnlockAllowed,
  emptyPinLockoutState,
  parsePinLockoutState,
  PIN_LOCKOUT_SCHEDULE_MS,
  registerPinFailure,
  registerPinSuccess,
  serializePinLockoutState,
} from "./pin-lockout";

describe("pin-lockout", () => {
  it("escalates lockout with injected clock (no sleeps)", () => {
    let now = 1_000_000;
    let state = emptyPinLockoutState();

    for (let i = 0; i < 3; i++) {
      state = registerPinFailure(state, now);
    }
    // 3rd failure → schedule index 3 → 2_000ms in PIN_LOCKOUT_SCHEDULE_MS
    expect(state.failedCount).toBe(3);
    expect(state.lockedUntil).toBe(now + PIN_LOCKOUT_SCHEDULE_MS[3]);

    expect(() => assertPinUnlockAllowed(state, now)).toThrow(AppAuthError);
    now = state.lockedUntil;
    expect(() => assertPinUnlockAllowed(state, now)).not.toThrow();

    state = registerPinSuccess();
    expect(state).toEqual(emptyPinLockoutState());
  });

  it("serialize/parse round-trips random state", () => {
    const state = {
      failedCount: 4 + Math.floor(Math.random() * 3),
      lockedUntil: 5_000_000 + Math.floor(Math.random() * 10_000),
    };
    expect(parsePinLockoutState(serializePinLockoutState(state))).toEqual(state);
  });
});
