import { agentDebugLog } from "@/lib/debug-agent-log";

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

    // #region agent log

    agentDebugLog(

      "api-client.ts:abortBackgroundRequests",

      "aborting sync requests",

      {},

      "L",

      "post-fix",

    );

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



  private async ensureAccessTokenFresh(): Promise<void> {

    const expiresAtStr = await this.authStore.getAccessTokenExpiresAt();

    if (!expiresAtStr) return;



    const msLeft = new Date(expiresAtStr).getTime() - Date.now();

    if (msLeft > TOKEN_REFRESH_BUFFER_MS) return;



    const tokenExpired = msLeft <= 0;



    if (!tokenExpired) {

      // #region agent log

      agentDebugLog(

        "api-client.ts:ensureAccessTokenFresh",

        "proactive refresh deferred",

        { msLeft },

        "G",

        "post-fix",

      );

      // #endregion

      void this.scheduleHttp("sync", () => this.refreshTokenInner());

      return;

    }



    // #region agent log

    agentDebugLog(

      "api-client.ts:ensureAccessTokenFresh",

      "token expired refresh required",

      { msLeft },

      "G",

      "post-fix",

    );

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

    // #region agent log

    agentDebugLog(

      "api-client.ts:tryRefreshToken",

      "refresh start",

      {},

      "G",

      "post-fix",

    );

    // #endregion



    const refreshToken = await this.authStore.getRefreshToken();

    if (!refreshToken || refreshToken.startsWith("offline.")) {

      // #region agent log

      agentDebugLog(

        "api-client.ts:tryRefreshToken",

        "refresh skipped",

        {

          hasToken: Boolean(refreshToken),

          offline: refreshToken?.startsWith("offline.") ?? false,

        },

        "G",

        "post-fix",

      );

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

        // #region agent log

        agentDebugLog(

          "api-client.ts:tryRefreshToken",

          "refresh failed",

          { status: res.status },

          "G",

          "post-fix",

        );

        // #endregion

        return false;

      }

      const auth = JSON.parse(await res.text()) as AuthResult;

      await this.authStore.setTokens(auth);

      // #region agent log

      agentDebugLog(

        "api-client.ts:tryRefreshToken",

        "refresh success",

        { expiresAt: auth.accessTokenExpiresAt },

        "G",

        "post-fix",

      );

      // #endregion

      return true;

    } catch (e) {

      // #region agent log

      agentDebugLog(

        "api-client.ts:tryRefreshToken",

        "refresh error",

        { error: e instanceof Error ? e.message : String(e) },

        "G",

        "post-fix",

      );

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

    // #region agent log

    agentDebugLog(

      "api-client.ts:request",

      "request start",

      { method, path, url, lane },

      "I",

      "post-fix",

    );

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

      // #region agent log

      agentDebugLog(

        "api-client.ts:request",

        "fetch failed",

        { method, path, lane, apiBaseUrl: API_BASE_URL, error: detail },

        "F",

        "post-fix",

      );

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



    // #region agent log

    agentDebugLog(

      "api-client.ts:request",

      "request response",

      { method, path, lane, status },

      "I",

      "post-fix",

    );

    // #endregion



    if (status === 401 && !isRetry && !isAuthPath(path)) {

      if (isOfflineToken(token)) {

        // #region agent log

        agentDebugLog(

          "api-client.ts:request",

          "401 offline token rejected",

          { method, path, lane },

          "O",

          "post-fix",

        );

        // #endregion

        await this.authStore.clearSessionExpired();

        throw new ApiError("Session expired. Please sign in again.", 401);

      }

      // #region agent log

      agentDebugLog(

        "api-client.ts:request",

        "401 received, attempting refresh",

        { method, path, lane },

        "G",

        "post-fix",

      );

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


