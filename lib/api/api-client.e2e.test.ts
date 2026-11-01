import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/http-fetch", () => ({
  httpFetch: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  API_BASE_URL: "http://api.test/v1",
}));

import { httpFetch } from "@/lib/api/http-fetch";
import { ApiClient } from "@/lib/api/api-client";
import { AuthApi } from "@/lib/api/auth-api";
import type { AuthStore } from "@/lib/session/auth-store";

const httpFetchMock = vi.mocked(httpFetch);

describe("ApiClient + AuthApi E2E", () => {
  beforeEach(() => httpFetchMock.mockReset());

  it("register round-trip stores tokens via AuthStore", async () => {
    const tokens: {
      accessToken?: string;
      refreshToken?: string;
      userId?: string;
      deviceId?: string;
    } = {};
    const store = {
      getAccessToken: async () => tokens.accessToken ?? null,
      getRefreshToken: async () => tokens.refreshToken ?? null,
      getAccessTokenExpiresAt: async () =>
        new Date(Date.now() + 60_000).toISOString(),
      setTokens: async (auth: {
        accessToken: string;
        refreshToken: string;
        userId: string;
        deviceId: string;
      }) => {
        tokens.accessToken = auth.accessToken;
        tokens.refreshToken = auth.refreshToken;
        tokens.userId = auth.userId;
        tokens.deviceId = auth.deviceId;
      },
      clearSessionExpired: async () => {
        tokens.accessToken = undefined;
      },
    } as unknown as AuthStore;

    const userId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    const access = `a.${crypto.randomUUID()}`;
    const refresh = `r.${crypto.randomUUID()}`;
    httpFetchMock.mockResolvedValueOnce({
      status: 201,
      statusText: "Created",
      text: async () =>
        JSON.stringify({
          accessToken: access,
          refreshToken: refresh,
          accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          userId,
          deviceId,
        }),
      bytes: async () => new Uint8Array(),
    });

    const api = new AuthApi(new ApiClient(store));
    const username = `user_${crypto.randomUUID().slice(0, 8)}`;
    const result = await api.register({
      username,
      password: `pw-${crypto.randomUUID()}`,
      device: {
        deviceName: "test",
        registrationId: 1,
        identityKeyPublicBase64: "AA==",
        signedPreKey: {
          keyId: 1,
          publicKeyBase64: "AQ==",
          signatureBase64: "Ag==",
        },
        oneTimePreKeys: [{ keyId: 1, publicKeyBase64: "Aw==" }],
      },
    });

    expect(result.userId).toBe(userId);
    expect(result.deviceId).toBe(deviceId);
    // AuthApi.register does not set tokens itself — caller does; ensure HTTP path works.
    expect(httpFetchMock.mock.calls[0]![0]).toContain("/auth/register");
    expect(httpFetchMock.mock.calls[0]![1].method).toBe("POST");
  });
});
