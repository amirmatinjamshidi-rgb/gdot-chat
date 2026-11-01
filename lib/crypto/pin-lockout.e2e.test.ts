import { describe, expect, it } from "vitest";

import { AppAuthError } from "@/lib/auth/app-auth-error";

import {
  assertPinUnlockAllowed,
  emptyPinLockoutState,
  registerPinFailure,
  registerPinSuccess,
} from "./pin-lockout";

describe("pin-lockout E2E", () => {
  it("blocks then allows after lockout window using injected clock", () => {
    let now = 42_000;
    let state = emptyPinLockoutState();
    for (let i = 0; i < 5; i++) state = registerPinFailure(state, now);
    expect(() => assertPinUnlockAllowed(state, now)).toThrow(AppAuthError);
    now = state.lockedUntil + 1;
    expect(() => assertPinUnlockAllowed(state, now)).not.toThrow();
    state = registerPinSuccess();
    expect(state.failedCount).toBe(0);
  });
});
