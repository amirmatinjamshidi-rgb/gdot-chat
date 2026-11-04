import { beforeEach, describe, expect, it } from "vitest";
import * as SecureStore from "expo-secure-store";
import {
  __resetBiometricStub,
  __setBiometricStub,
  __getAuthenticateCallCount,
  SecurityLevel,
} from "expo-local-authentication";

import { KekManager } from "@/lib/db/kek-manager";
import {
  SECURE_STORE_KEK_KEY,
  SECURE_STORE_KEK_MODE_KEY,
  SECURE_STORE_KEK_PRESENT_KEY,
  SECURE_STORE_PIN_WRAPPED_KEK_KEY,
} from "@/lib/db/constants";

function setSecureStoreBiometric(value: boolean) {
  (
    SecureStore as { __setCanUseBiometricAuthentication?: (v: boolean) => void }
  ).__setCanUseBiometricAuthentication?.(value);
}

function resetAll() {
  (SecureStore as { __resetSecureStoreStub?: () => void }).__resetSecureStoreStub?.();
  __resetBiometricStub();
}

describe("KekManager biometric unlock prompts", () => {
  beforeEach(() => {
    resetAll();
    setSecureStoreBiometric(true);
    __setBiometricStub({
      hasHardware: true,
      enrolled: true,
      level: SecurityLevel.BIOMETRIC_STRONG,
    });
  });

  it("unwrap does exactly one SecureStore auth read and zero authenticateAsync", async () => {
    const kek = new KekManager();
    await kek.createKekAfterBiometric();
    expect(__getAuthenticateCallCount()).toBe(0);

    const authSets = (
      SecureStore as { __getSetCalls?: () => { key: string; options?: { requireAuthentication?: boolean } }[] }
    ).__getSetCalls?.() ?? [];
    expect(
      authSets.filter(
        (c) => c.key === SECURE_STORE_KEK_KEY && c.options?.requireAuthentication,
      ),
    ).toHaveLength(1);

    kek.clearCachedPassphrase();
    (
      SecureStore as { __clearCallLog?: () => void }
    ).__clearCallLog?.();

    const pass = await kek.getPassphraseForDb();
    expect(pass).toHaveLength(64);
    expect(__getAuthenticateCallCount()).toBe(0);

    const gets =
      (
        SecureStore as {
          __getGetCalls?: () => {
            key: string;
            options?: { requireAuthentication?: boolean };
          }[];
        }
      ).__getGetCalls?.() ?? [];
    const authReads = gets.filter(
      (c) =>
        c.key === SECURE_STORE_KEK_KEY && c.options?.requireAuthentication === true,
    );
    expect(authReads).toHaveLength(1);
  });

  it("hasKek and getLockMode never read the auth-bound KEK key", async () => {
    const kek = new KekManager();
    await kek.createKekAfterBiometric();
    (
      SecureStore as { __clearCallLog?: () => void }
    ).__clearCallLog?.();

    expect(await kek.getLockMode()).toBe("biometric");
    expect(await kek.hasKek()).toBe(true);

    const gets =
      (
        SecureStore as { __getGetCalls?: () => { key: string }[] }
      ).__getGetCalls?.() ?? [];
    expect(gets.some((c) => c.key === SECURE_STORE_KEK_KEY)).toBe(false);
    expect(gets.some((c) => c.key === SECURE_STORE_KEK_MODE_KEY)).toBe(true);
  });

  it("concurrent getPassphraseForDb shares one in-flight auth read", async () => {
    const kek = new KekManager();
    await kek.createKekAfterBiometric();
    kek.clearCachedPassphrase();
    (
      SecureStore as { __clearCallLog?: () => void }
    ).__clearCallLog?.();

    const [a, b, c] = await Promise.all([
      kek.getPassphraseForDb(),
      kek.getPassphraseForDb(),
      kek.getPassphraseForDb(),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);

    const gets =
      (
        SecureStore as {
          __getGetCalls?: () => {
            key: string;
            options?: { requireAuthentication?: boolean };
          }[];
        }
      ).__getGetCalls?.() ?? [];
    const authReads = gets.filter(
      (c) =>
        c.key === SECURE_STORE_KEK_KEY && c.options?.requireAuthentication === true,
    );
    expect(authReads).toHaveLength(1);
  });

  it("clearCachedPassphrase forces a new auth read", async () => {
    const kek = new KekManager();
    await kek.createKekAfterBiometric();
    await kek.getPassphraseForDb();
    kek.clearCachedPassphrase();
    (
      SecureStore as { __clearCallLog?: () => void }
    ).__clearCallLog?.();
    await kek.getPassphraseForDb();
    const gets =
      (
        SecureStore as {
          __getGetCalls?: () => {
            key: string;
            options?: { requireAuthentication?: boolean };
          }[];
        }
      ).__getGetCalls?.() ?? [];
    expect(
      gets.filter(
        (c) =>
          c.key === SECURE_STORE_KEK_KEY &&
          c.options?.requireAuthentication === true,
      ),
    ).toHaveLength(1);
  });

  it("legacy present marker migrates mode without reading KEK", async () => {
    await SecureStore.setItemAsync(SECURE_STORE_KEK_PRESENT_KEY, "1");
    // Simulate an existing auth-bound value without mode key.
    await SecureStore.setItemAsync(SECURE_STORE_KEK_KEY, "ab".repeat(32), {
      requireAuthentication: true,
    });
    (
      SecureStore as { __clearCallLog?: () => void }
    ).__clearCallLog?.();

    const kek = new KekManager();
    expect(await kek.getLockMode()).toBe("biometric");
    expect(await kek.hasKek()).toBe(true);
    const gets =
      (
        SecureStore as { __getGetCalls?: () => { key: string }[] }
      ).__getGetCalls?.() ?? [];
    expect(gets.some((c) => c.key === SECURE_STORE_KEK_KEY)).toBe(false);
  });
});

describe("KekManager pin path cache", () => {
  beforeEach(() => {
    resetAll();
    setSecureStoreBiometric(false);
    __setBiometricStub({ enrolled: false, level: SecurityLevel.NONE });
  });

  it("second getPassphraseForDb uses memory cache (no extra pin unwrap store reads of wrapped blob after cache)", async () => {
    const pin = `pin-${crypto.randomUUID().slice(0, 8)}!!`;
    const kek = new KekManager();
    await kek.createKekWithPin(pin);
    (
      SecureStore as { __clearCallLog?: () => void }
    ).__clearCallLog?.();
    const first = await kek.getPassphraseForDb({ pin });
    const getsAfterFirst =
      (
        SecureStore as { __getGetCalls?: () => { key: string }[] }
      ).__getGetCalls?.() ?? [];
    // create already cached passphrase — first get should be cache hit with zero gets
    expect(first).toHaveLength(64);
    expect(
      getsAfterFirst.filter((c) => c.key === SECURE_STORE_PIN_WRAPPED_KEK_KEY),
    ).toHaveLength(0);

    kek.clearCachedPassphrase();
    (
      SecureStore as { __clearCallLog?: () => void }
    ).__clearCallLog?.();
    const second = await kek.getPassphraseForDb({ pin });
    expect(second).toBe(first);
  });
});
