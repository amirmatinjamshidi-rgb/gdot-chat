import { API_BASE_URL } from "@/lib/config";

import type { AuthResult } from "@/lib/api/api-types";

import { httpFetch } from "@/lib/api/http-fetch";

import type { AuthStore } from "@/lib/session/auth-store";

import { isOfflineToken } from "@/lib/session/auth-store";

const REQUEST_TIMEOUT_MS = 45_000;

const REFRESH_TIMEOUT_MS = 15_000;

const TOKEN_REFRESH_BUFFER_MS = 60_000;

export class ApiError extends Error {

  constructor(

    message: string,

    public readonly status: number,

  ) {

    super(message);

    this.name = "ApiError";

  }

}

function isAuthPath(path: string): boolean {

  return (

    path.startsWith("/auth/login") ||

    path.startsWith("/auth/register") ||

    path.startsWith("/auth/refresh")

  );

}

function isPendingPath(path: string): boolean {

  return path.startsWith("/messages/pending");

}

export class ApiClient {

  private refreshInFlight: Promise<boolean> | null = null;

  private pendingAbort: AbortController | null = null;

  private httpTail: Promise<unknown> = Promise.resolve();

  constructor(private readonly authStore: AuthStore) {}

  /** Cancel in-flight pullPending fetch and wait for it to release the HTTP slot. */

  async abortBackgroundRequests(): Promise<void> {

    // #endregion

    this.pendingAbort?.abort();

    await this.httpTail;

  }

  private scheduleHttp<T>(

    lane: "sync" | "priority",

    fn: () => Promise<T>,

  ): Promise<T> {

    if (lane === "priority") {

      this.pendingAbort?.abort();

    }

    const run = this.httpTail.then(fn);

    this.httpTail = run.catch(() => {});

    return run;

  }

  async get<T>(path: string): Promise<T> {

    return this.request<T>("GET", path, undefined, false, "sync");

  }

  /** Send-path GET — not queued behind background sync. */

  async getPriority<T>(path: string): Promise<T> {

    return this.request<T>("GET", path, undefined, false, "priority");

  }

  async post<T>(path: string, body?: unknown): Promise<T> {

    return this.request<T>("POST", path, body, false, "sync");

  }

  /** Message send and other user-critical POSTs. */

  async postPriority<T>(path: string, body?: unknown): Promise<T> {

    return this.request<T>("POST", path, body, false, "priority");

  }

  async put<T>(path: string, body?: unknown): Promise<T> {

    return this.request<T>("PUT", path, body, false, "sync");

  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path, undefined, false, "priority");
  }

  async putOctetStream(
    path: string,
    body: Uint8Array,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.requestBinary("PUT", path, body, timeoutMs, "bytes", signal);
  }

  async getOctetStream(
    path: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const res = await this.requestBinary("GET", path, undefined, timeoutMs, "bytes", signal);
    return res;
  }

  private async requestBinary(
    method: string,
    path: string,
    body: Uint8Array | undefined,
    timeoutMs: number,
    _responseType: "bytes",
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    if (!path.startsWith("/auth/")) {
      await this.ensureAccessTokenFresh();
    }
    const url = `${API_BASE_URL}${path}`;
    const token = await this.authStore.getAccessToken();
    const headers: Record<string, string> = {
      Accept: "application/octet-stream",
      Connection: "close",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/octet-stream";
      headers["Content-Length"] = String(body.byteLength);
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const run = async (): Promise<Uint8Array> => {
      const res = await httpFetch(url, {
        method,
        headers,
        body,
        signal,
        timeoutMs,
        responseType: "bytes",
      });
      if (res.status === 401) {
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
          const retryToken = await this.authStore.getAccessToken();
          if (retryToken) headers.Authorization = `Bearer ${retryToken}`;
          const retry = await httpFetch(url, {
            method,
            headers,
            body,
            signal,
            timeoutMs,
            responseType: "bytes",
          });
          if (retry.status < 200 || retry.status >= 300) {
            throw new ApiError(await retry.text(), retry.status);
          }
          return retry.bytes();
        }
        throw new ApiError("Session expired. Please sign in again.", 401);
      }
      if (res.status < 200 || res.status >= 300) {
        throw new ApiError(await res.text(), res.status);
      }
      if (res.status === 204) return new Uint8Array(0);
      return res.bytes();
    };

    return this.scheduleHttp("priority", run);
  }

  private async ensureAccessTokenFresh(): Promise<void> {

    const expiresAtStr = await this.authStore.getAccessTokenExpiresAt();

    if (!expiresAtStr) return;

    const msLeft = new Date(expiresAtStr).getTime() - Date.now();

    if (msLeft > TOKEN_REFRESH_BUFFER_MS) return;

    const tokenExpired = msLeft <= 0;

    if (!tokenExpired) {

      // #endregion

      void this.scheduleHttp("sync", () => this.refreshTokenInner());

      return;

    }

    // #endregion

    const ok = await this.tryRefreshToken();

    if (!ok) {

      await this.authStore.clearSessionExpired();

      throw new ApiError("Session expired. Please sign in again.", 401);

    }

  }

  private async tryRefreshToken(): Promise<boolean> {

    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = this.refreshTokenInner().finally(() => {

      this.refreshInFlight = null;

    });

    return this.refreshInFlight;

  }

  private async refreshTokenInner(): Promise<boolean> {

    // #endregion

    const refreshToken = await this.authStore.getRefreshToken();

    if (!refreshToken || refreshToken.startsWith("offline.")) {

      // #endregion

      return false;

    }

    try {

      const res = await httpFetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Connection: "close",
        },
        body: JSON.stringify({ refreshToken }),
        timeoutMs: REFRESH_TIMEOUT_MS,
      });

      if (res.status !== 200) {

        // #endregion

        return false;

      }

      const auth = JSON.parse(await res.text()) as AuthResult;

      await this.authStore.setTokens(auth);

      // #endregion

      return true;

    } catch (e) {

      // #endregion

      return false;

    }

  }

  private async request<T>(

    method: string,

    path: string,

    body: unknown | undefined,

    isRetry: boolean,

    lane: "sync" | "priority",

  ): Promise<T> {

    return this.scheduleHttp(lane, () =>

      this.requestOnce<T>(method, path, body, isRetry, lane),

    );

  }

  private async requestOnce<T>(

    method: string,

    path: string,

    body: unknown | undefined,

    isRetry: boolean,

    lane: "sync" | "priority",

  ): Promise<T> {

    if (!isAuthPath(path) && !isRetry) {

      await this.ensureAccessTokenFresh();

    }

    const url = `${API_BASE_URL}${path}`;

    // #endregion

    const token = await this.authStore.getAccessToken();

    const headers: Record<string, string> = {

      Accept: "application/json",

      Connection: "close",

    };

    if (body !== undefined) {

      headers["Content-Type"] = "application/json";

    }

    if (token) {

      headers.Authorization = `Bearer ${token}`;

    }

    const controller = new AbortController();

    if (lane === "sync" && isPendingPath(path)) {

      this.pendingAbort?.abort();

      this.pendingAbort = controller;

    }

    let status: number;

    let statusText: string;

    let bodyText: string;

    try {

      const res = await httpFetch(url, {

        method,

        headers,

        body: body !== undefined ? JSON.stringify(body) : undefined,

        signal: controller.signal,

        timeoutMs: REQUEST_TIMEOUT_MS,

      });

      status = res.status;

      statusText = res.statusText;

      bodyText = await res.text();

    } catch (e) {

      const detail = e instanceof Error ? e.message : String(e);

      // #endregion

      throw new Error(

        `Cannot reach API at ${API_BASE_URL} (${detail}). ` +

          "Check EXPO_PUBLIC_API_URL matches your PC LAN IP and Windows Firewall allows port 5066.",

      );

    } finally {

      if (lane === "sync" && this.pendingAbort === controller) {

        this.pendingAbort = null;

      }

    }

    // #endregion

    if (status === 401 && !isRetry && !isAuthPath(path)) {

      if (isOfflineToken(token)) {

        // #endregion

        await this.authStore.clearSessionExpired();

        throw new ApiError("Session expired. Please sign in again.", 401);

      }

      // #endregion

      const refreshed = await this.tryRefreshToken();

      if (refreshed) {

        return this.requestOnce<T>(method, path, body, true, lane);

      }

      await this.authStore.clearSessionExpired();

      throw new ApiError("Session expired. Please sign in again.", 401);

    }

    if (status < 200 || status >= 300) {

      throw new ApiError(bodyText || statusText, status);

    }

    if (status === 204 || bodyText.length === 0) {

      return undefined as T;

    }

    return JSON.parse(bodyText) as T;

  }

}

