import { beforeEach, describe, expect, it } from "vitest";

import * as SecureStore from "expo-secure-store";
import {
  __resetBiometricStub,
  __setBiometricStub,
  SecurityLevel,
} from "expo-local-authentication";

import {
  getBiometricCapability,
  assertStrongBiometricForSecureStore,
} from "@/lib/auth/biometric-capability";
import { AppAuthError } from "@/lib/auth/app-auth-error";

describe("getBiometricCapability", () => {
  beforeEach(() => {
    (SecureStore as { __resetSecureStoreStub?: () => void }).__resetSecureStoreStub?.();
    __resetBiometricStub();
  });

  it("treats hardware without enrollment as not usable for SecureStore", async () => {
    (
      SecureStore as { __setCanUseBiometricAuthentication?: (v: boolean) => void }
    ).__setCanUseBiometricAuthentication?.(true);
    __setBiometricStub({
      hasHardware: true,
      enrolled: false,
      level: SecurityLevel.NONE,
    });

    const cap = await getBiometricCapability();
    expect(cap.hasHardware).toBe(true);
    expect(cap.hasStrongBiometric).toBe(false);
    expect(cap.canUseStrongForSecureStore).toBe(false);
    expect(cap.hasWeakOnly).toBe(false);
  });

  it("treats weak-only enrollment as PIN path (not SecureStore strong)", async () => {
    (
      SecureStore as { __setCanUseBiometricAuthentication?: (v: boolean) => void }
    ).__setCanUseBiometricAuthentication?.(true);
    __setBiometricStub({
      hasHardware: true,
      enrolled: true,
      level: SecurityLevel.BIOMETRIC_WEAK,
    });

    const cap = await getBiometricCapability();
    expect(cap.hasStrongBiometric).toBe(false);
    expect(cap.canUseStrongForSecureStore).toBe(false);
    expect(cap.hasWeakOnly).toBe(true);
  });

  it("allows SecureStore strong only when strong biometric is enrolled", async () => {
    (
      SecureStore as { __setCanUseBiometricAuthentication?: (v: boolean) => void }
    ).__setCanUseBiometricAuthentication?.(true);
    __setBiometricStub({
      hasHardware: true,
      enrolled: true,
      level: SecurityLevel.BIOMETRIC_STRONG,
    });

    const cap = await getBiometricCapability();
    expect(cap.hasStrongBiometric).toBe(true);
    expect(cap.canUseStrongForSecureStore).toBe(true);
    expect(cap.hasWeakOnly).toBe(false);
  });

  it("assertStrongBiometricForSecureStore throws NOT_ENROLLED when nothing enrolled", async () => {
    (
      SecureStore as { __setCanUseBiometricAuthentication?: (v: boolean) => void }
    ).__setCanUseBiometricAuthentication?.(true);
    __setBiometricStub({
      hasHardware: true,
      enrolled: false,
      level: SecurityLevel.NONE,
    });

    await expect(assertStrongBiometricForSecureStore()).rejects.toMatchObject({
      code: "NOT_ENROLLED",
    });
  });
});
