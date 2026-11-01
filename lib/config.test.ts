import { describe, expect, it } from "vitest";
import { resolveApiBaseUrl } from "@/lib/config/api-base-url";

describe("resolveApiBaseUrl", () => {
  it("uses EXPO_PUBLIC_API_URL when set", () => {
    const url = resolveApiBaseUrl(
      { EXPO_PUBLIC_API_URL: "http://10.0.2.2:5066/v1/" },
      null,
    );
    expect(url).toBe("http://10.0.2.2:5066/v1");
  });

  it("throws a clear error in __DEV__ when unset", () => {
    const prev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    try {
      expect(() =>
        resolveApiBaseUrl({}, null),
      ).toThrow(/EXPO_PUBLIC_API_URL is required/);
      expect(() =>
        resolveApiBaseUrl({}, null),
      ).toThrow(/no hardcoded LAN IP/);
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = prev;
    }
  });

  it("fails in production builds when unset", () => {
    const prev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    try {
      expect(() =>
        resolveApiBaseUrl(
          { EXPO_PUBLIC_API_URL: "" },
          null,
        ),
      ).toThrow(/EXPO_PUBLIC_API_URL is not configured/);
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = prev;
    }
  });

  it("prefers env over extra", () => {
    expect(
      resolveApiBaseUrl(
        { EXPO_PUBLIC_API_URL: "http://env.example/v1" },
        "http://extra.example/v1",
      ),
    ).toBe("http://env.example/v1");
  });
});
