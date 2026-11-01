import { describe, expect, test } from "vitest";

import { AppAuthError } from "@/lib/auth/app-auth-error";
import { bytesToHex } from "@/lib/db/sql-utils";

import {
  APP_PIN_MIN_LENGTH,
  parsePinWrappedKek,
  serializePinWrappedKek,
  unwrapKekWithPin,
  validateAppPin,
  wrapKekWithPin,
} from "./pin-kek";

function randomKekHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

describe("pin-kek", () => {
  test("rejects short PIN", () => {
    expect(() => validateAppPin("short")).toThrow(AppAuthError);
    expect(() => validateAppPin("a".repeat(APP_PIN_MIN_LENGTH - 1))).toThrow(
      AppAuthError,
    );
  });

  test("accepts passphrase-style PIN with letters and symbols", () => {
    expect(() => validateAppPin("Correct!Horse")).not.toThrow();
  });

  test("wrap/unwrap round-trip", () => {
    const kek = randomKekHex();
    const pin = "my-secret-8";
    const blob = wrapKekWithPin(kek, pin);
    expect(unwrapKekWithPin(blob, pin)).toBe(kek);
  });

  test("wrong PIN fails authentication", () => {
    const blob = wrapKekWithPin(randomKekHex(), "right-pin!");
    expect(() => unwrapKekWithPin(blob, "wrong-pin!")).toThrow(AppAuthError);
  });

  test("serialize/parse preserves blob", () => {
    const blob = wrapKekWithPin(randomKekHex(), "serialize1");
    const restored = parsePinWrappedKek(serializePinWrappedKek(blob));
    expect(restored).toEqual(blob);
  });
});
