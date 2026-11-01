import { beforeEach, describe, expect, it } from "vitest";
import * as SecureStore from "expo-secure-store";
import { AuthStore } from "@/lib/session/auth-store";

/**
 * E2E-style: full token set/get/clear cycle with stronger keychain options.
 * Uses random ids (no hardcoded user/device tokens).
 */
describe("AuthStore token lifecycle (E2E)", () => {
  beforeEach(() => {
    (SecureStore as { __resetSecureStoreStub?: () => void }).__resetSecureStoreStub?.();
  });

  it("round-trips random tokens then clears", async () => {
    const store = new AuthStore();
    const auth = {
      accessToken: `atk.${crypto.randomUUID()}.${crypto.randomUUID()}`,
      refreshToken: `rtk.${crypto.randomUUID()}.${crypto.randomUUID()}`,
      accessTokenExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      userId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
    };
    await store.setTokens(auth);
    expect(await store.isLoggedIn()).toBe(true);
    expect(await store.getAccessToken()).toBe(auth.accessToken);
    expect(await store.getRefreshToken()).toBe(auth.refreshToken);
    expect(await store.getUserId()).toBe(auth.userId);
    expect(await store.getDeviceId()).toBe(auth.deviceId);
    await store.clear();
    expect(await store.getRefreshToken()).toBeNull();
    expect(await store.isLoggedIn()).toBe(false);
  });
});
