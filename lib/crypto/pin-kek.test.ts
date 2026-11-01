import { describe, expect, test } from "vitest";

import { AppAuthError } from "@/lib/auth/app-auth-error";
import { bytesToHex } from "@/lib/db/sql-utils";

import {
  APP_PIN_MIN_LENGTH,
  needsPinKdfUpgrade,
  parsePinWrappedKek,
  PIN_SCRYPT,
  PIN_SCRYPT_LEGACY,
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

function randomPin(): string {
  return `pin_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
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

  test("wrap/unwrap round-trip with current params", () => {
    const kek = randomKekHex();
    const pin = randomPin();
    // Fast params for unit speed; production default remains PIN_SCRYPT.
    const blob = wrapKekWithPin(kek, pin, { N: 2 ** 10, r: 8, p: 1, dkLen: 32 });
    expect(unwrapKekWithPin(blob, pin)).toBe(kek);
    expect(blob.kdf?.N).toBe(2 ** 10);
  });

  test("legacy blob without kdf still unwraps with N=2^15", () => {
    const kek = randomKekHex();
    const pin = randomPin();
    const modern = wrapKekWithPin(kek, pin, PIN_SCRYPT_LEGACY);
    const legacy = {
      saltB64: modern.saltB64,
      nonceB64: modern.nonceB64,
      ciphertextB64: modern.ciphertextB64,
    };
    expect(needsPinKdfUpgrade(legacy)).toBe(true);
    expect(unwrapKekWithPin(legacy, pin)).toBe(kek);
  });

  test("wrong PIN fails authentication", () => {
    const blob = wrapKekWithPin(randomKekHex(), randomPin(), {
      N: 2 ** 10,
      r: 8,
      p: 1,
      dkLen: 32,
    });
    expect(() => unwrapKekWithPin(blob, randomPin())).toThrow(AppAuthError);
  });

  test("serialize/parse preserves blob including kdf", () => {
    const blob = wrapKekWithPin(randomKekHex(), randomPin(), {
      N: 2 ** 10,
      r: 8,
      p: 1,
      dkLen: 32,
    });
    const restored = parsePinWrappedKek(serializePinWrappedKek(blob));
    expect(restored).toEqual(blob);
  });

  test("current PIN_SCRYPT is N=2^17", () => {
    expect(PIN_SCRYPT.N).toBe(2 ** 17);
    expect(PIN_SCRYPT.r).toBe(8);
    expect(PIN_SCRYPT.p).toBe(1);
  });
});
