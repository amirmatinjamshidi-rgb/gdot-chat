import * as SecureStore from "expo-secure-store";
import { getRandomBytes } from "expo-crypto";

import { AppAuthError } from "@/lib/auth/app-auth-error";
import {
  assertStrongBiometricForSecureStore,
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
  SECURE_STORE_KEK_PRESENT_KEY,
  SECURE_STORE_PIN_LOCKOUT_KEY,
  SECURE_STORE_PIN_WRAPPED_KEK_KEY,
} from "./constants";
import { bytesToHex } from "./sql-utils";

const AUTH_PROMPT = "Unlock Gdot Chat";

export type LockMode = "none" | "biometric" | "pin";

export interface IKekManager {
  hasKek(): Promise<boolean>;
  getLockMode(): Promise<LockMode>;
  createKekAfterBiometric(): Promise<void>;
  createKekWithPin(pin: string): Promise<void>;
  getPassphraseForDb(opts?: { pin?: string }): Promise<string>;
  clearCachedPassphrase(): void;
  /** True when an unwrapped passphrase is held in memory (warm session). */
  hasCachedPassphrase(): boolean;
  wipeKek(): Promise<void>;
}

export type KekManagerDeps = {
  clock?: Clock;
};

export class KekManager implements IKekManager {
  private readonly clock: Clock;
  private cachedPassphrase: string | null = null;
  private inflight: Promise<string> | null = null;

  constructor(deps: KekManagerDeps = {}) {
    this.clock = deps.clock ?? (() => Date.now());
  }

  /**
   * Presence only — never decrypts the auth-bound biometric KEK.
   * Relies on mode key + non-auth present marker (or pin-wrapped blob).
   */
  async hasKek(): Promise<boolean> {
    const mode = await this.getLockMode();
    if (mode === "none") return false;
    if (mode === "pin") {
      return (
        (await SecureStore.getItemAsync(SECURE_STORE_PIN_WRAPPED_KEK_KEY)) !==
        null
      );
    }
    // biometric: mode key (and optional present marker) — do not read KEK key.
    return true;
  }

  /**
   * Resolves lock mode without decrypting the auth-bound KEK.
   * Migrates legacy installs that only have a pin-wrapped blob or present marker.
   */
  async getLockMode(): Promise<LockMode> {
    const mode = await SecureStore.getItemAsync(SECURE_STORE_KEK_MODE_KEY);
    if (mode === "biometric" || mode === "pin") return mode;

    // Legacy pin path: pin-wrapped blob has no requireAuthentication.
    if (
      (await SecureStore.getItemAsync(SECURE_STORE_PIN_WRAPPED_KEK_KEY)) !==
      null
    ) {
      await SecureStore.setItemAsync(SECURE_STORE_KEK_MODE_KEY, "pin");
      return "pin";
    }

    // Legacy biometric: non-auth present marker only (never probe KEK key).
    const present = await SecureStore.getItemAsync(
      SECURE_STORE_KEK_PRESENT_KEY,
    );
    if (present === "1") {
      await SecureStore.setItemAsync(SECURE_STORE_KEK_MODE_KEY, "biometric");
      return "biometric";
    }

    return "none";
  }

  async createKekAfterBiometric(): Promise<void> {
    await assertStrongBiometricForSecureStore();

    const kek = getRandomBytes(32);
    const hex = bytesToHex(kek);
    try {
      // Single biometric prompt: SecureStore requireAuthentication on write.
      await SecureStore.setItemAsync(SECURE_STORE_KEK_KEY, hex, {
        requireAuthentication: true,
        authenticationPrompt: AUTH_PROMPT,
      });
      await SecureStore.setItemAsync(SECURE_STORE_KEK_MODE_KEY, "biometric");
      await SecureStore.setItemAsync(SECURE_STORE_KEK_PRESENT_KEY, "1");
      this.cachedPassphrase = hex;
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
    const blob = await wrapKekWithPin(hex, pin);
    await SecureStore.setItemAsync(
      SECURE_STORE_PIN_WRAPPED_KEK_KEY,
      serializePinWrappedKek(blob),
    );
    await SecureStore.setItemAsync(SECURE_STORE_KEK_MODE_KEY, "pin");
    await SecureStore.setItemAsync(
      SECURE_STORE_PIN_LOCKOUT_KEY,
      serializePinLockoutState(registerPinSuccess()),
    );
    this.cachedPassphrase = hex;
  }

  clearCachedPassphrase(): void {
    this.cachedPassphrase = null;
  }

  hasCachedPassphrase(): boolean {
    return this.cachedPassphrase !== null;
  }

  async getPassphraseForDb(opts?: { pin?: string }): Promise<string> {
    if (this.cachedPassphrase) return this.cachedPassphrase;
    if (this.inflight) return this.inflight;

    const run = this.loadPassphrase(opts).then((hex) => {
      this.cachedPassphrase = hex;
      return hex;
    });
    this.inflight = run.finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async loadPassphrase(opts?: { pin?: string }): Promise<string> {
    const mode = await this.getLockMode();

    if (mode === "none") {
      throw new AppAuthError("KEK_MISSING");
    }

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
        const kekHex = await unwrapKekWithPin(blob, opts.pin);
        await SecureStore.setItemAsync(
          SECURE_STORE_PIN_LOCKOUT_KEY,
          serializePinLockoutState(registerPinSuccess()),
        );
        if (needsPinKdfUpgrade(blob)) {
          const upgraded = await wrapKekWithPin(kekHex, opts.pin);
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

    // Single biometric prompt: SecureStore requireAuthentication on read.
    // Do not also call LocalAuthentication.authenticateAsync.
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

    // Backfill present marker for installs that only had the mode key.
    const present = await SecureStore.getItemAsync(
      SECURE_STORE_KEK_PRESENT_KEY,
    );
    if (present !== "1") {
      await SecureStore.setItemAsync(SECURE_STORE_KEK_PRESENT_KEY, "1");
    }

    return hex;
  }

  async wipeKek(): Promise<void> {
    this.cachedPassphrase = null;
    this.inflight = null;
    await SecureStore.deleteItemAsync(SECURE_STORE_KEK_KEY);
    await SecureStore.deleteItemAsync(SECURE_STORE_PIN_WRAPPED_KEK_KEY);
    await SecureStore.deleteItemAsync(SECURE_STORE_KEK_MODE_KEY);
    await SecureStore.deleteItemAsync(SECURE_STORE_KEK_PRESENT_KEY);
    await SecureStore.deleteItemAsync(SECURE_STORE_PIN_LOCKOUT_KEY);
  }
}

export const kekManager = new KekManager();
