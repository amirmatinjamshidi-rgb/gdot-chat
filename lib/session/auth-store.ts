import * as SecureStore from "expo-secure-store";

import type { AuthResult } from "@/lib/api/api-types";

const ACCESS_TOKEN_KEY = "gdot.auth.access";
const REFRESH_TOKEN_KEY = "gdot.auth.refresh";
const USER_ID_KEY = "gdot.auth.userId";
const DEVICE_ID_KEY = "gdot.auth.deviceId";

export class AuthStore {
  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  }

  async getDeviceId(): Promise<string | null> {
    return SecureStore.getItemAsync(DEVICE_ID_KEY);
  }

  async getUserId(): Promise<string | null> {
    return SecureStore.getItemAsync(USER_ID_KEY);
  }

  async setTokens(auth: AuthResult): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, auth.accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, auth.refreshToken);
    await SecureStore.setItemAsync(USER_ID_KEY, auth.userId);
    await SecureStore.setItemAsync(DEVICE_ID_KEY, auth.deviceId);
  }

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_ID_KEY);
    await SecureStore.deleteItemAsync(DEVICE_ID_KEY);
  }

  async isLoggedIn(): Promise<boolean> {
    return (await this.getAccessToken()) !== null;
  }
}

export const authStore = new AuthStore();
