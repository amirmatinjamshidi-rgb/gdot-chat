import { beforeEach, describe, expect, it, vi } from "vitest";

import * as SecureStore from "expo-secure-store";
import {
  __resetBiometricStub,
  __setBiometricStub,
  SecurityLevel,
} from "expo-local-authentication";

function setSecureStoreBiometric(value: boolean) {
  (
    SecureStore as { __setCanUseBiometricAuthentication?: (v: boolean) => void }
  ).__setCanUseBiometricAuthentication?.(value);
}

import { AppAuthError } from "@/lib/auth/app-auth-error";
import { ensureKek, registerUser } from "@/lib/auth/registration";
import { KekManager } from "@/lib/db/kek-manager";
import type { IDatabase } from "@/lib/db/database-types";
import {
  MemoryCryptoKeyStore,
  MemoryIdentityStore,
} from "@/lib/test/memory-stores";
import { AuthStore } from "@/lib/session/auth-store";
import type { AuthApi } from "@/lib/api/auth-api";
import type { LibSignalAdapter } from "@/lib/crypto/libsignal-adapter";

function fakeDb(): IDatabase & { openedWith?: string; openCount: number } {
  let open = false;
  const db: IDatabase & { openedWith?: string; openCount: number } = {
    openCount: 0,
    openedWith: undefined,
    async open(passphrase: string) {
      this.openCount += 1;
      this.openedWith = passphrase;
      open = true;
    },
    async close() {
      open = false;
    },
    isOpen: () => open,
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
  };
  return db;
}

function fakeCrypto(): LibSignalAdapter {
  const key = (n: number) => new Uint8Array(32).fill(n);
  return {
    generateIdentityKeyPair: async () => ({
      publicKey: key(1),
      privateKey: key(2),
    }),
    generateRegistrationId: async () => 42,
    generateSignedPreKey: async () => ({
      keyId: 1,
      publicKey: key(3),
      privateKey: key(4),
      signature: key(5),
    }),
    generatePreKeys: async (start: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        keyId: start + i,
        publicKey: key(6 + i),
        privateKey: key(7 + i),
      })),
  } as unknown as LibSignalAdapter;
}

describe("ensureKek + registerUser", () => {
  beforeEach(() => {
    (SecureStore as { __resetSecureStoreStub?: () => void }).__resetSecureStoreStub?.();
    __resetBiometricStub();
  });

  it("ensureKek with PIN creates wrapped KEK when biometrics unavailable", async () => {
    __setBiometricStub({ enrolled: false, level: SecurityLevel.NONE });
    const kek = new KekManager();
    const pin = `pin-${crypto.randomUUID().slice(0, 8)}!!`;
    await ensureKek(kek, pin);
    expect(await kek.hasKek()).toBe(true);
    expect(await kek.getLockMode()).toBe("pin");
  });

  it("ensureKek throws PIN_REQUIRED without pin or biometrics", async () => {
    __setBiometricStub({ enrolled: false });
    await expect(ensureKek(new KekManager())).rejects.toBeInstanceOf(
      AppAuthError,
    );
  });


  it("ensureKek uses PIN path when SecureStore says yes but nothing is enrolled", async () => {
    setSecureStoreBiometric(true);
    __setBiometricStub({
      hasHardware: true,
      enrolled: false,
      level: SecurityLevel.NONE,
    });
    const kek = new KekManager();
    await expect(ensureKek(kek)).rejects.toMatchObject({ code: "PIN_REQUIRED" });
    const pin = `pin-${crypto.randomUUID().slice(0, 8)}!!`;
    await ensureKek(kek, pin);
    expect(await kek.getLockMode()).toBe("pin");
  });

  it("ensureKek uses PIN path for weak-only biometrics", async () => {
    setSecureStoreBiometric(true);
    __setBiometricStub({
      hasHardware: true,
      enrolled: true,
      level: SecurityLevel.BIOMETRIC_WEAK,
    });
    const kek = new KekManager();
    await expect(ensureKek(kek)).rejects.toMatchObject({ code: "PIN_REQUIRED" });
    const pin = `pin-${crypto.randomUUID().slice(0, 8)}!!`;
    await ensureKek(kek, pin);
    expect(await kek.getLockMode()).toBe("pin");
  });

  it("ensureKek uses biometric path when strong biometric is enrolled", async () => {
    setSecureStoreBiometric(true);
    __setBiometricStub({
      hasHardware: true,
      enrolled: true,
      level: SecurityLevel.BIOMETRIC_STRONG,
    });
    const kek = new KekManager();
    await ensureKek(kek);
    expect(await kek.getLockMode()).toBe("biometric");
  });

  it("ensureKek maps failed biometric creation NOT_ENROLLED to PIN_REQUIRED", async () => {
    setSecureStoreBiometric(true);
    __setBiometricStub({
      hasHardware: true,
      enrolled: true,
      level: SecurityLevel.BIOMETRIC_STRONG,
    });
    const kekManager = {
      hasKek: async () => false,
      getLockMode: async () => "none" as const,
      createKekAfterBiometric: async () => {
        throw new AppAuthError("NOT_ENROLLED");
      },
      createKekWithPin: async () => {
        throw new Error("should not create PIN in this assertion");
      },
      getPassphraseForDb: async () => "",
      wipeKek: async () => undefined,
    };
    await expect(ensureKek(kekManager)).rejects.toMatchObject({
      code: "PIN_REQUIRED",
    });
  });

  it("ensureKek falls back to PIN after biometric NOT_ENROLLED when pin provided", async () => {
    setSecureStoreBiometric(true);
    __setBiometricStub({
      hasHardware: true,
      enrolled: true,
      level: SecurityLevel.BIOMETRIC_STRONG,
      authError: "not_enrolled",
    });
    // After failed biometric auth, enrolled level still looks strong in this stub,
    // so use a wrapper that fails biometric then allows PIN via real manager once
    // capability is forced off.
    const inner = new KekManager();
    let biometricAttempts = 0;
    const kekManager = {
      hasKek: () => inner.hasKek(),
      getLockMode: () => inner.getLockMode(),
      createKekAfterBiometric: async () => {
        biometricAttempts += 1;
        throw new AppAuthError("NOT_ENROLLED");
      },
      createKekWithPin: async (pin: string) => {
        // Simulate re-check seeing no strong enrollment after the failure.
        setSecureStoreBiometric(false);
        __setBiometricStub({
          hasHardware: true,
          enrolled: false,
          level: SecurityLevel.NONE,
        });
        await inner.createKekWithPin(pin);
      },
      getPassphraseForDb: (opts?: { pin?: string }) =>
        inner.getPassphraseForDb(opts),
      wipeKek: () => inner.wipeKek(),
    };
    const pin = `pin-${crypto.randomUUID().slice(0, 8)}!!`;
    await ensureKek(kekManager, pin);
    expect(biometricAttempts).toBe(1);
    expect(await inner.getLockMode()).toBe("pin");
  });

  it("registerUser creates local identity keys and stores auth tokens", async () => {
    __setBiometricStub({ enrolled: false });
    const pin = `reg-${crypto.randomUUID().slice(0, 8)}ab`;
    const kek = new KekManager();
    const identityStore = new MemoryIdentityStore();
    const cryptoKeyStore = new MemoryCryptoKeyStore();
    const authStore = new AuthStore();
    const db = fakeDb();
    const userId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    const username = `u_${crypto.randomUUID().slice(0, 8)}`;

    const authApi = {
      register: async () => ({
        accessToken: `a.${crypto.randomUUID()}`,
        refreshToken: `r.${crypto.randomUUID()}`,
        accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        userId,
        deviceId,
      }),
    } as unknown as AuthApi;

    await registerUser({
      username,
      password: `pw-${crypto.randomUUID()}`,
      deviceName: "vitest",
      authApi,
      crypto: fakeCrypto(),
      authStore,
      kekManager: kek,
      db,
      identityStore,
      cryptoKeyStore,
      appPin: pin,
    });

    const local = await identityStore.getLocalIdentity();
    expect(local?.userId).toBe(userId);
    expect(local?.deviceId).toBe(deviceId);
    expect(local?.username).toBe(username.toLowerCase());
    expect(await cryptoKeyStore.getIdentityPrivateKey()).not.toBeNull();
    expect(await cryptoKeyStore.getSignedPreKey(1)).not.toBeNull();
    expect(await authStore.getAccessToken()).toMatch(/^a\./);
    expect(db.openCount).toBe(1);
    expect(db.isOpen()).toBe(false);
  });
});
