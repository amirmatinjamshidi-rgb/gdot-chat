import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { getRandomBytes } from "expo-crypto";

import { SECURE_STORE_KEK_KEY } from "./constants";
import { bytesToHex } from "./sql-utils";

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
    const ok = await LocalAuthentication.authenticateAsync({
      promptMessage: "Set up app lock",
    });
    if (!ok.success) throw new Error("Biometric required");
    const kek = getRandomBytes(32);
    const hex = bytesToHex(kek);
    await SecureStore.setItemAsync(SECURE_STORE_KEK_KEY, hex, {
      requireAuthentication: true,
      authenticationPrompt: "Unlock Gdot Chat",
    });
  }

  async getPassphraseForDb(): Promise<string> {
    const hex = await SecureStore.getItemAsync(SECURE_STORE_KEK_KEY, {
      requireAuthentication: true,
      authenticationPrompt: "Unlock Gdot Chat",
    });
    if (!hex) throw new Error("KEK missing");
    return hex;
  }

  async wipeKek(): Promise<void> {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEK_KEY);
  }
}

export const kekManager = new KekManager();
