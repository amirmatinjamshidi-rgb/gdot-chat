import { afterEach, describe, expect, test, vi } from "vitest";

import { AppAuthError } from "@/lib/auth/app-auth-error";
import { Platform } from "react-native";
import { setQuickCryptoScryptFailForTests } from "@/lib/test/quick-crypto-stub";

import {
  derivePinScryptKey,
  isNativePinScryptPlatform,
  setPinScryptDeriveForTests,
} from "./pin-scrypt";

const FAST = { N: 2 ** 10, r: 8, p: 1, dkLen: 32 } as const;

afterEach(() => {
  setPinScryptDeriveForTests(null);
  setQuickCryptoScryptFailForTests(false);
  (Platform as { OS: string }).OS = "ios";
  vi.restoreAllMocks();
});

describe("isNativePinScryptPlatform", () => {
  test("ios and android are native", () => {
    expect(isNativePinScryptPlatform("ios")).toBe(true);
    expect(isNativePinScryptPlatform("android")).toBe(true);
  });

  test("web is not native", () => {
    expect(isNativePinScryptPlatform("web")).toBe(false);
  });
});

describe("derivePinScryptKey", () => {
  test("honors test override", async () => {
    const override = vi.fn(async () => new Uint8Array(32).fill(7));
    setPinScryptDeriveForTests(override);
    const out = await derivePinScryptKey(
      new Uint8Array([1]),
      new Uint8Array([2]),
      FAST,
    );
    expect(out).toEqual(new Uint8Array(32).fill(7));
    expect(override).toHaveBeenCalledOnce();
  });

  test("on native, native failure throws NATIVE_SCRYPT_UNAVAILABLE (no noble)", async () => {
    (Platform as { OS: string }).OS = "android";
    setPinScryptDeriveForTests(null);
    setQuickCryptoScryptFailForTests(true);
    try {
      await derivePinScryptKey(
        new TextEncoder().encode("pin"),
        new Uint8Array(16),
        FAST,
      );
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AppAuthError);
      expect((e as AppAuthError).code).toBe("NATIVE_SCRYPT_UNAVAILABLE");
    }
  });

  test("on web, native failure falls back to noble", async () => {
    (Platform as { OS: string }).OS = "web";
    setPinScryptDeriveForTests(null);
    setQuickCryptoScryptFailForTests(true);
    const key = await derivePinScryptKey(
      new TextEncoder().encode("web-pin"),
      new Uint8Array(16).fill(9),
      FAST,
    );
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  test("native platform with working quick-crypto stub succeeds", async () => {
    (Platform as { OS: string }).OS = "ios";
    setPinScryptDeriveForTests(null);
    const key = await derivePinScryptKey(
      new TextEncoder().encode("test-pin-ok"),
      new Uint8Array(16).fill(3),
      FAST,
    );
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });
});
