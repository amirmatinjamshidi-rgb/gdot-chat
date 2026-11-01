import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/http-fetch", () => ({
  httpFetch: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  API_BASE_URL: "http://api.test/v1",
}));

import { httpFetch } from "@/lib/api/http-fetch";
import { ApiClient, ApiError } from "@/lib/api/api-client";
import type { AuthStore } from "@/lib/session/auth-store";

const httpFetchMock = vi.mocked(httpFetch);

function mockRes(status: number, body: string, statusText = "x") {
  return {
    status,
    statusText,
    text: async () => body,
    bytes: async () => new TextEncoder().encode(body),
  };
}

function fakeAuthStore(overrides?: Partial<{
  access: string | null;
  refresh: string | null;
  expiresAt: string | null;
}>): AuthStore {
  let access: string | null = overrides?.access ?? `tok.${crypto.randomUUID()}`;
  let refresh: string | null =
    overrides?.refresh ?? `ref.${crypto.randomUUID()}`;
  let expiresAt: string | null =
    overrides?.expiresAt ?? new Date(Date.now() + 3600_000).toISOString();
  return {
    getAccessToken: async () => access,
    getRefreshToken: async () => refresh,
    getAccessTokenExpiresAt: async () => expiresAt,
    setTokens: async (auth: {
      accessToken: string;
      refreshToken: string;
      accessTokenExpiresAt: string;
    }) => {
      access = auth.accessToken;
      refresh = auth.refreshToken;
      expiresAt = auth.accessTokenExpiresAt;
    },
    clearSessionExpired: async () => {
      access = null;
      refresh = null;
      expiresAt = null;
    },
  } as unknown as AuthStore;
}

describe("ApiClient", () => {
  beforeEach(() => {
    httpFetchMock.mockReset();
  });

  it("GETs JSON with Authorization bearer", async () => {
    const token = `access.${crypto.randomUUID()}`;
    const client = new ApiClient(fakeAuthStore({ access: token }));
    const payload = { id: crypto.randomUUID() };
    httpFetchMock.mockResolvedValueOnce(mockRes(200, JSON.stringify(payload)));

    const result = await client.get<{ id: string }>("/users/me");
    expect(result).toEqual(payload);
    expect(httpFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = httpFetchMock.mock.calls[0]!;
    expect(url).toBe("http://api.test/v1/users/me");
    expect(init.headers.Authorization).toBe(`Bearer ${token}`);
    expect(init.method).toBe("GET");
  });

  it("refreshes once on 401 then retries", async () => {
    const store = fakeAuthStore({
      access: "old-access",
      refresh: `refresh.${crypto.randomUUID()}`,
    });
    const client = new ApiClient(store);
    const newAccess = `new.${crypto.randomUUID()}`;
    httpFetchMock
      .mockResolvedValueOnce(mockRes(401, "expired"))
      .mockResolvedValueOnce(
        mockRes(
          200,
          JSON.stringify({
            accessToken: newAccess,
            refreshToken: `r2.${crypto.randomUUID()}`,
            accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
            userId: crypto.randomUUID(),
            deviceId: crypto.randomUUID(),
          }),
        ),
      )
      .mockResolvedValueOnce(mockRes(200, JSON.stringify({ ok: true })));

    const result = await client.get<{ ok: boolean }>("/devices");
    expect(result).toEqual({ ok: true });
    expect(httpFetchMock).toHaveBeenCalledTimes(3);
    expect(await store.getAccessToken()).toBe(newAccess);
  });

  it("throws ApiError on non-401 failures", async () => {
    const client = new ApiClient(fakeAuthStore());
    httpFetchMock.mockResolvedValueOnce(mockRes(503, "unavailable", "Service"));
    await expect(client.post("/messages", { x: 1 })).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("priority lane aborts in-flight pending pull", async () => {
    const client = new ApiClient(fakeAuthStore());
    let pendingAbort: AbortSignal | undefined;
    let pendingReject: ((e: unknown) => void) | undefined;
    httpFetchMock.mockImplementation(async (_url, init) => {
      if (String(_url).includes("/messages/pending")) {
        pendingAbort = init.signal;
        await new Promise((_, reject) => {
          pendingReject = reject;
          init.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        });
      }
      return mockRes(200, "{}");
    });
    const pendingPromise = client.get("/messages/pending").catch((e) => e);
    // Allow pending request to start and park on abort wait.
    for (let i = 0; i < 10 && !pendingAbort; i++) await Promise.resolve();
    await client.postPriority("/messages", { body: "hi" });
    expect(pendingAbort?.aborted).toBe(true);
    await pendingPromise;
  });
});
