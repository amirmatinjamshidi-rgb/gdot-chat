import * as SecureStore from "expo-secure-store";
import { getRandomBytes } from "expo-crypto";

import { AppAuthError } from "@/lib/auth/app-auth-error";
import {
  assertStrongBiometricForSecureStore,
  authenticateWithDeviceFallback,
  mapSecureStoreAuthError,
} from "@/lib/auth/biometric-capability";
import { SECURE_STORE_KEK_KEY } from "./constants";
import { bytesToHex } from "./sql-utils";

const AUTH_PROMPT = "Unlock Gdot Chat";
const SETUP_PROMPT = "Set up app lock";

export interface IKekManager {
  hasKek(): Promise<boolean>;
  createKekAfterBiometric(): Promise<void>;
  getPassphraseForDb(): Promise<string>;
  wipeKek(): Promise<void>;
}

export class KekManager implements IKekManager {
  async hasKek(): Promise<boolean> {
    return (await SecureStore.getItemAsync(SECURE_STORE_KEK_KEY)) !== null;
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
    } catch (error) {
      throw mapSecureStoreAuthError(error);
    }
  }

  async getPassphraseForDb(): Promise<string> {
    // Option B: system sheet (Strong biometric + device PIN/pattern/password
    // fallback) first, then SecureStore requireAuthentication for the KEK.
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
  }
}

export const kekManager = new KekManager();
