import { Platform } from "react-native";
export type HttpFetchBody = string | Uint8Array | ArrayBuffer;

export type HttpFetchInit = {
  method: string;
  headers: Record<string, string>;
  body?: HttpFetchBody;
  signal?: AbortSignal;
  timeoutMs: number;
  responseType?: "text" | "bytes";
};

export type HttpFetchResponse = {
  status: number;
  statusText: string;
  text(): Promise<string>;
  bytes(): Promise<Uint8Array>;
};

/** RN fetch() on Android can stall after aborted keep-alive sockets; XHR uses a separate path. */
export async function httpFetch(
  url: string,
  init: HttpFetchInit,
): Promise<HttpFetchResponse> {
  const useXhr = Platform.OS !== "web";
  return useXhr ? xhrFetch(url, init) : globalFetch(url, init);
}

function toArrayBuffer(body: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (body instanceof ArrayBuffer) return body;
  return body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength,
  ) as ArrayBuffer;
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
    const fetchBody =
      init.body === undefined
        ? undefined
        : typeof init.body === "string"
          ? init.body
          : toArrayBuffer(init.body);
    const res = await fetch(url, {
      method: init.method,
      headers: init.headers,
      body: fetchBody,
      signal: controller.signal,
    });
    if (init.responseType === "bytes") {
      const buf = new Uint8Array(await res.arrayBuffer());
      return {
        status: res.status,
        statusText: res.statusText,
        text: async () => new TextDecoder().decode(buf),
        bytes: async () => buf,
      };
    }
    const body = await res.text();
    return {
      status: res.status,
      statusText: res.statusText,
      text: async () => body,
      bytes: async () => new TextEncoder().encode(body),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function xhrFetch(url: string, init: HttpFetchInit): Promise<HttpFetchResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const wantBytes = init.responseType === "bytes";

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    xhr.open(init.method, url, true);
    xhr.responseType = wantBytes ? "arraybuffer" : "text";
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
      const bytes = wantBytes
        ? new Uint8Array(xhr.response as ArrayBuffer)
        : new TextEncoder().encode(xhr.responseText ?? "");
      const text = wantBytes
        ? new TextDecoder().decode(bytes)
        : (xhr.responseText ?? "");
      finish(() =>
        resolve({
          status,
          statusText: xhr.statusText || String(status),
          text: async () => text,
          bytes: async () => bytes,
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

    const sendBody =
      init.body === undefined
        ? null
        : typeof init.body === "string"
          ? init.body
          : toArrayBuffer(init.body);
    xhr.send(sendBody);
  });
}
