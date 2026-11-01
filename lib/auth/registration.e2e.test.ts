import { beforeEach, describe, expect, it } from "vitest";

import * as SecureStore from "expo-secure-store";
import {
  __resetBiometricStub,
  SecurityLevel,
  __setBiometricStub,
} from "expo-local-authentication";

import { registerUser } from "@/lib/auth/registration";
import { KekManager } from "@/lib/db/kek-manager";
import type { IDatabase } from "@/lib/db/database-types";
import {
  MemoryCryptoKeyStore,
  MemoryIdentityStore,
} from "@/lib/test/memory-stores";
import { AuthStore } from "@/lib/session/auth-store";
import type { AuthApi } from "@/lib/api/auth-api";
import type { LibSignalAdapter } from "@/lib/crypto/libsignal-adapter";
import type { RegisterRequest } from "@/lib/api/api-types";

describe("registerUser E2E (KEK before server account)", () => {
  beforeEach(() => {
    (SecureStore as { __resetSecureStoreStub?: () => void }).__resetSecureStoreStub?.();
    __resetBiometricStub();
  });

  it("does not call register when PIN missing and no biometrics", async () => {
    __setBiometricStub({ enrolled: false, level: SecurityLevel.NONE });
    let registerCalled = false;
    const authApi = {
      register: async () => {
        registerCalled = true;
        throw new Error("should not run");
      },
    } as unknown as AuthApi;

    await expect(
      registerUser({
        username: `x_${crypto.randomUUID().slice(0, 6)}`,
        password: "password-12345",
        deviceName: "e2e",
        authApi,
        crypto: {
          generateIdentityKeyPair: async () => {
            throw new Error("crypto should not run before kek");
          },
        } as unknown as LibSignalAdapter,
        authStore: new AuthStore(),
        kekManager: new KekManager(),
        db: {
          isOpen: () => false,
          open: async () => undefined,
          close: async () => undefined,
          deleteDatabase: async () => undefined,
        } as unknown as IDatabase,
        identityStore: new MemoryIdentityStore(),
        cryptoKeyStore: new MemoryCryptoKeyStore(),
      }),
    ).rejects.toMatchObject({ name: "AppAuthError" });
    expect(registerCalled).toBe(false);
  });

  it("sends generated prekeys in register body", async () => {
    __setBiometricStub({ enrolled: false });
    const pin = `e2e-${crypto.randomUUID().slice(0, 8)}zz`;
    let body: RegisterRequest | null = null;
    const authApi = {
      register: async (req: RegisterRequest) => {
        body = req;
        return {
          accessToken: `a.${crypto.randomUUID()}`,
          refreshToken: `r.${crypto.randomUUID()}`,
          accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          userId: crypto.randomUUID(),
          deviceId: crypto.randomUUID(),
        };
      },
    } as unknown as AuthApi;

    const key = (n: number) => new Uint8Array(32).fill(n);
    await registerUser({
      username: `bob_${crypto.randomUUID().slice(0, 6)}`,
      password: "password-12345",
      deviceName: "phone",
      authApi,
      crypto: {
        generateIdentityKeyPair: async () => ({
          publicKey: key(1),
          privateKey: key(2),
        }),
        generateRegistrationId: async () => 99,
        generateSignedPreKey: async () => ({
          keyId: 1,
          publicKey: key(3),
          privateKey: key(4),
          signature: key(5),
        }),
        generatePreKeys: async () => [
          { keyId: 1, publicKey: key(6), privateKey: key(7) },
          { keyId: 2, publicKey: key(8), privateKey: key(9) },
        ],
      } as unknown as LibSignalAdapter,
      authStore: new AuthStore(),
      kekManager: new KekManager(),
      db: {
        async open() {},
        async close() {},
        async deleteDatabase() {},
        isOpen() {
          return false;
        },
        async run() {
          return { changes: 0, lastInsertRowId: 0 };
        },
        async getFirst() {
          return null;
        },
        async getAll() {
          return [];
        },
        async withTransaction<T>(fn: () => Promise<T>) {
          return fn();
        },
      } as IDatabase,
      identityStore: new MemoryIdentityStore(),
      cryptoKeyStore: new MemoryCryptoKeyStore(),
      appPin: pin,
    });

    expect(body).not.toBeNull();
    expect(body!.device.registrationId).toBe(99);
    expect(body!.device.oneTimePreKeys).toHaveLength(2);
    expect(body!.device.signedPreKey.keyId).toBe(1);
  });
});
