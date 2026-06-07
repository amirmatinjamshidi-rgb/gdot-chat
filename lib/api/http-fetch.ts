import { Platform } from "react-native";

import { agentDebugLog } from "@/lib/debug-agent-log";

export type HttpFetchInit = {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  timeoutMs: number;
};

export type HttpFetchResponse = {
  status: number;
  statusText: string;
  text(): Promise<string>;
};

/** RN fetch() on Android can stall after aborted keep-alive sockets; XHR uses a separate path. */
export async function httpFetch(
  url: string,
  init: HttpFetchInit,
): Promise<HttpFetchResponse> {
  const useXhr = Platform.OS !== "web";
  const started = Date.now();
  // #region agent log
  agentDebugLog(
    "http-fetch.ts:httpFetch",
    "transport start",
    { method: init.method, useXhr, url: url.replace(/access_token=[^&]+/, "access_token=*") },
    "P",
    "post-fix",
  );
  // #endregion

  try {
    const res = useXhr
      ? await xhrFetch(url, init)
      : await globalFetch(url, init);
    // #region agent log
    agentDebugLog(
      "http-fetch.ts:httpFetch",
      "transport end",
      { method: init.method, status: res.status, ms: Date.now() - started },
      "P",
      "post-fix",
    );
    // #endregion
    return res;
  } catch (e) {
    // #region agent log
    agentDebugLog(
      "http-fetch.ts:httpFetch",
      "transport error",
      {
        method: init.method,
        ms: Date.now() - started,
        error: e instanceof Error ? e.message : String(e),
      },
      "P",
      "post-fix",
    );
    // #endregion
    throw e;
  }
}

async function globalFetch(
  url: string,
  init: HttpFetchInit,
): Promise<HttpFetchResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs);
  if (init.signal) {
    init.signal.addEventListener("abort", () => controller.abort(), {
      once: true,
    });
  }

  try {
    const res = await fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
    });
    const body = await res.text();
    return {
      status: res.status,
      statusText: res.statusText,
      text: async () => body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function xhrFetch(url: string, init: HttpFetchInit): Promise<HttpFetchResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    xhr.open(init.method, url, true);
    xhr.responseType = "text";
    xhr.timeout = init.timeoutMs;

    for (const [key, value] of Object.entries(init.headers)) {
      xhr.setRequestHeader(key, value);
    }

    const onAbort = () => {
      xhr.abort();
      finish(() => reject(new Error("Aborted")));
    };

    if (init.signal) {
      if (init.signal.aborted) {
        onAbort();
        return;
      }
      init.signal.addEventListener("abort", onAbort, { once: true });
    }

    const timer = setTimeout(() => {
      xhr.abort();
      finish(() => reject(new Error("Aborted")));
    }, init.timeoutMs);

    xhr.onload = () => {
      const status = xhr.status;
      const body = xhr.responseText ?? "";
      finish(() =>
        resolve({
          status,
          statusText: xhr.statusText || String(status),
          text: async () => body,
        }),
      );
    };

    xhr.onerror = () => {
      finish(() => reject(new TypeError("Network request failed")));
    };

    xhr.ontimeout = () => {
      finish(() => reject(new Error("Aborted")));
    };

    xhr.onloadend = () => {
      if (init.signal) {
        init.signal.removeEventListener("abort", onAbort);
      }
    };

    xhr.send(init.body ?? null);
  });
}
