import * as SecureStore from "expo-secure-store";
import { getRandomBytes } from "expo-crypto";

import { AppAuthError } from "@/lib/auth/app-auth-error";
import {
  assertStrongBiometricForSecureStore,
  authenticateWithDeviceFallback,
  getBiometricCapability,
  mapSecureStoreAuthError,
} from "@/lib/auth/biometric-capability";
import {
  needsPinKdfUpgrade,
  parsePinWrappedKek,
  serializePinWrappedKek,
  unwrapKekWithPin,
  validateAppPin,
  wrapKekWithPin,
} from "@/lib/crypto/pin-kek";
import {
  assertPinUnlockAllowed,
  parsePinLockoutState,
  registerPinFailure,
  registerPinSuccess,
  serializePinLockoutState,
  type Clock,
} from "@/lib/crypto/pin-lockout";
import {
  SECURE_STORE_KEK_KEY,
  SECURE_STORE_KEK_MODE_KEY,
  SECURE_STORE_PIN_LOCKOUT_KEY,
  SECURE_STORE_PIN_WRAPPED_KEK_KEY,
} from "./constants";
import { bytesToHex } from "./sql-utils";

const AUTH_PROMPT = "Unlock Gdot Chat";
const SETUP_PROMPT = "Set up app lock";

export type LockMode = "none" | "biometric" | "pin";

export interface IKekManager {
  hasKek(): Promise<boolean>;
  getLockMode(): Promise<LockMode>;
  createKekAfterBiometric(): Promise<void>;
  createKekWithPin(pin: string): Promise<void>;
  getPassphraseForDb(opts?: { pin?: string }): Promise<string>;
  wipeKek(): Promise<void>;
}

export type KekManagerDeps = {
  clock?: Clock;
};

export class KekManager implements IKekManager {
  private readonly clock: Clock;

  constructor(deps: KekManagerDeps = {}) {
    this.clock = deps.clock ?? (() => Date.now());
  }

  async hasKek(): Promise<boolean> {
    const mode = await this.getLockMode();
    if (mode === "biometric") {
      return (await SecureStore.getItemAsync(SECURE_STORE_KEK_KEY)) !== null;
    }
    if (mode === "pin") {
      return (
        (await SecureStore.getItemAsync(SECURE_STORE_PIN_WRAPPED_KEK_KEY)) !==
        null
      );
    }
    return (await SecureStore.getItemAsync(SECURE_STORE_KEK_KEY)) !== null;
  }

  async getLockMode(): Promise<LockMode> {
    const mode = await SecureStore.getItemAsync(SECURE_STORE_KEK_MODE_KEY);
    if (mode === "biometric" || mode === "pin") return mode;
    if ((await SecureStore.getItemAsync(SECURE_STORE_KEK_KEY)) !== null) {
      return "biometric";
    }
    if (
      (await SecureStore.getItemAsync(SECURE_STORE_PIN_WRAPPED_KEK_KEY)) !==
      null
    ) {
      return "pin";
    }
    return "none";
  }

  async createKekAfterBiometric(): Promise<void> {
    await assertStrongBiometricForSecureStore();
    await authenticateWithDeviceFallback(SETUP_PROMPT);

    const kek = getRandomBytes(32);
    const hex = bytesToHex(kek);
    try {
      await SecureStore.setItemAsync(SECURE_STORE_KEK_KEY, hex, {
        requireAuthentication: true,
        authenticationPrompt: AUTH_PROMPT,
      });
      await SecureStore.setItemAsync(SECURE_STORE_KEK_MODE_KEY, "biometric");
    } catch (error) {
      throw mapSecureStoreAuthError(error);
    }
  }

  async createKekWithPin(pin: string): Promise<void> {
    validateAppPin(pin);
    const capability = await getBiometricCapability();
    // Same capability gate as ensureKek: hardware-without-enrollment or
    // weak-only must allow PIN; only refuse when Strong is truly usable.
    if (capability.canUseStrongForSecureStore) {
      throw new AppAuthError(
        "UNKNOWN",
        "Strong biometrics are available; use biometric app lock instead of a PIN.",
      );
    }

    const kek = getRandomBytes(32);
    const hex = bytesToHex(kek);
    const blob = wrapKekWithPin(hex, pin);
    await SecureStore.setItemAsync(
      SECURE_STORE_PIN_WRAPPED_KEK_KEY,
      serializePinWrappedKek(blob),
    );
    await SecureStore.setItemAsync(SECURE_STORE_KEK_MODE_KEY, "pin");
    await SecureStore.setItemAsync(
      SECURE_STORE_PIN_LOCKOUT_KEY,
      serializePinLockoutState(registerPinSuccess()),
    );
  }

  async getPassphraseForDb(opts?: { pin?: string }): Promise<string> {
    const mode = await this.getLockMode();

    if (mode === "pin") {
      if (!opts?.pin) throw new AppAuthError("PIN_REQUIRED");
      const now = this.clock();
      const lockRaw = await SecureStore.getItemAsync(SECURE_STORE_PIN_LOCKOUT_KEY);
      let lockState = parsePinLockoutState(lockRaw);
      assertPinUnlockAllowed(lockState, now);

      const raw = await SecureStore.getItemAsync(
        SECURE_STORE_PIN_WRAPPED_KEK_KEY,
      );
      if (!raw) throw new AppAuthError("KEK_MISSING");
      const blob = parsePinWrappedKek(raw);
      try {
        const kekHex = unwrapKekWithPin(blob, opts.pin);
        await SecureStore.setItemAsync(
          SECURE_STORE_PIN_LOCKOUT_KEY,
          serializePinLockoutState(registerPinSuccess()),
        );
        if (needsPinKdfUpgrade(blob)) {
          const upgraded = wrapKekWithPin(kekHex, opts.pin);
          await SecureStore.setItemAsync(
            SECURE_STORE_PIN_WRAPPED_KEK_KEY,
            serializePinWrappedKek(upgraded),
          );
        }
        return kekHex;
      } catch (e) {
        if (e instanceof AppAuthError && e.code === "AUTH_FAILED") {
          lockState = registerPinFailure(lockState, now);
          await SecureStore.setItemAsync(
            SECURE_STORE_PIN_LOCKOUT_KEY,
            serializePinLockoutState(lockState),
          );
          assertPinUnlockAllowed(lockState, now);
        }
        throw e;
      }
    }

    await assertStrongBiometricForSecureStore();
    await authenticateWithDeviceFallback(AUTH_PROMPT);

    let hex: string | null;
    try {
      hex = await SecureStore.getItemAsync(SECURE_STORE_KEK_KEY, {
        requireAuthentication: true,
        authenticationPrompt: AUTH_PROMPT,
      });
    } catch (error) {
      throw mapSecureStoreAuthError(error);
    }

    if (!hex) throw new AppAuthError("KEK_MISSING");
    return hex;
  }

  async wipeKek(): Promise<void> {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEK_KEY);
    await SecureStore.deleteItemAsync(SECURE_STORE_PIN_WRAPPED_KEK_KEY);
    await SecureStore.deleteItemAsync(SECURE_STORE_KEK_MODE_KEY);
    await SecureStore.deleteItemAsync(SECURE_STORE_PIN_LOCKOUT_KEY);
  }
}

export const kekManager = new KekManager();
