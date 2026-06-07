import * as SecureStore from "expo-secure-store";

import type { AuthResult } from "@/lib/api/api-types";

const ACCESS_TOKEN_KEY = "gdot.auth.access";
const REFRESH_TOKEN_KEY = "gdot.auth.refresh";
const ACCESS_TOKEN_EXPIRES_KEY = "gdot.auth.accessExpires";
const USER_ID_KEY = "gdot.auth.userId";
const DEVICE_ID_KEY = "gdot.auth.deviceId";

type AuthStoreListener = () => void;

export class AuthStore {
  private readonly sessionExpiredHandlers = new Set<AuthStoreListener>();
  private readonly tokensUpdatedHandlers = new Set<AuthStoreListener>();

  onSessionExpired(handler: AuthStoreListener): () => void {
    this.sessionExpiredHandlers.add(handler);
    return () => this.sessionExpiredHandlers.delete(handler);
  }

  onTokensUpdated(handler: AuthStoreListener): () => void {
    this.tokensUpdatedHandlers.add(handler);
    return () => this.tokensUpdatedHandlers.delete(handler);
  }

  private emitSessionExpired(): void {
    for (const handler of this.sessionExpiredHandlers) handler();
  }

  private emitTokensUpdated(): void {
    for (const handler of this.tokensUpdatedHandlers) handler();
  }

  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  }

  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  }

  async getAccessTokenExpiresAt(): Promise<string | null> {
    const stored = await SecureStore.getItemAsync(ACCESS_TOKEN_EXPIRES_KEY);
    if (stored) return stored;

    const accessToken = await this.getAccessToken();
    if (!accessToken || accessToken.startsWith("offline.")) return null;
    return jwtExpiresAtIso(accessToken);
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
    await SecureStore.setItemAsync(
      ACCESS_TOKEN_EXPIRES_KEY,
      auth.accessTokenExpiresAt,
    );
    await SecureStore.setItemAsync(USER_ID_KEY, auth.userId);
    await SecureStore.setItemAsync(DEVICE_ID_KEY, auth.deviceId);
    this.emitTokensUpdated();
  }

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_EXPIRES_KEY);
    await SecureStore.deleteItemAsync(USER_ID_KEY);
    await SecureStore.deleteItemAsync(DEVICE_ID_KEY);
  }

  async clearSessionExpired(): Promise<void> {
    await this.clear();
    this.emitSessionExpired();
  }

  async isLoggedIn(): Promise<boolean> {
    const token = await this.getAccessToken();
    return token !== null && !isOfflineToken(token);
  }

  async hasOfflineTokens(): Promise<boolean> {
    const token = await this.getAccessToken();
    return isOfflineToken(token);
  }
}

export function isOfflineToken(token: string | null | undefined): boolean {
  return token?.startsWith("offline.") ?? false;
}

function jwtExpiresAtIso(accessToken: string): string | null {
  const parts = accessToken.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(globalThis.atob(base64)) as { exp?: number };
    if (typeof payload.exp !== "number") return null;
    return new Date(payload.exp * 1000).toISOString();
  } catch {
    return null;
  }
}

export const authStore = new AuthStore();
