import { beforeEach, describe, expect, it, vi } from "vitest";

import * as SecureStore from "expo-secure-store";

import {
  AuthStore,
  ACCESS_TOKEN_SECURE_STORE_OPTIONS,
  REFRESH_TOKEN_SECURE_STORE_OPTIONS,
} from "@/lib/session/auth-store";

describe("AuthStore SecureStore protection", () => {
  beforeEach(() => {
    (SecureStore as { __resetSecureStoreStub?: () => void }).__resetSecureStoreStub?.();
  });

  it("stores refresh token with WHEN_UNLOCKED_THIS_DEVICE_ONLY and without requireAuthentication", async () => {
    const store = new AuthStore();
    const auth = {
      accessToken: `access.${crypto.randomUUID()}`,
      refreshToken: `refresh.${crypto.randomUUID()}`,
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      userId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
    };

    await store.setTokens(auth);

    const refreshOpts = (
      SecureStore as {
        __getLastOptions?: (k: string) => { keychainAccessible?: number; requireAuthentication?: boolean };
      }
    ).__getLastOptions?.("gdot.auth.refresh");

    expect(refreshOpts?.keychainAccessible).toBe(
      SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    );
    expect(refreshOpts?.requireAuthentication).toBeUndefined();
    expect(REFRESH_TOKEN_SECURE_STORE_OPTIONS.keychainAccessible).toBe(
      SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    );
    expect(REFRESH_TOKEN_SECURE_STORE_OPTIONS.requireAuthentication).toBeUndefined();

    const accessOpts = (
      SecureStore as {
        __getLastOptions?: (k: string) => { keychainAccessible?: number };
      }
    ).__getLastOptions?.("gdot.auth.access");
    expect(accessOpts?.keychainAccessible).toBe(
      ACCESS_TOKEN_SECURE_STORE_OPTIONS.keychainAccessible,
    );

    await expect(store.getRefreshToken()).resolves.toBe(auth.refreshToken);
  });
});
