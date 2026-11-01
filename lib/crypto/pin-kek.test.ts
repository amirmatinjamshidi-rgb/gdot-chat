import { afterEach, describe, expect, test, vi } from "vitest";

import { AppAuthError } from "@/lib/auth/app-auth-error";
import { bytesToHex } from "@/lib/db/sql-utils";
import { scrypt as nobleScrypt } from "@noble/hashes/scrypt.js";

import {
  APP_PIN_MIN_LENGTH,
  needsPinKdfUpgrade,
  parsePinWrappedKek,
  PIN_KEK_BLOB_VERSION,
  PIN_SCRYPT,
  PIN_SCRYPT_LEGACY,
  serializePinWrappedKek,
  unwrapKekWithPin,
  validateAppPin,
  wrapKekWithPin,
} from "./pin-kek";
import { setPinScryptDeriveForTests } from "./pin-scrypt";

function randomKekHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function randomPin(): string {
  return `pin_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

const FAST = { N: 2 ** 10, r: 8, p: 1, dkLen: 32 } as const;

afterEach(() => {
  setPinScryptDeriveForTests(null);
});

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

  test("wrap/unwrap round-trip with mocked native scrypt", async () => {
    const derive = vi.fn(async (password: Uint8Array, salt: Uint8Array, params) =>
      nobleScrypt(password, salt, {
        N: params.N,
        r: params.r,
        p: params.p,
        dkLen: params.dkLen,
      }),
    );
    setPinScryptDeriveForTests(derive);

    const kek = randomKekHex();
    const pin = randomPin();
    const blob = await wrapKekWithPin(kek, pin, FAST);
    expect(await unwrapKekWithPin(blob, pin)).toBe(kek);
    expect(blob.kdf?.N).toBe(2 ** 10);
    expect(blob.v).toBe(PIN_KEK_BLOB_VERSION);
    expect(derive).toHaveBeenCalled();
  });

  test("legacy blob without kdf/v still unwraps with N=2^15", async () => {
    setPinScryptDeriveForTests(async (password, salt, params) =>
      nobleScrypt(password, salt, {
        N: params.N,
        r: params.r,
        p: params.p,
        dkLen: params.dkLen,
      }),
    );
    const kek = randomKekHex();
    const pin = randomPin();
    const modern = await wrapKekWithPin(kek, pin, PIN_SCRYPT_LEGACY);
    const legacy = {
      saltB64: modern.saltB64,
      nonceB64: modern.nonceB64,
      ciphertextB64: modern.ciphertextB64,
    };
    expect(needsPinKdfUpgrade(legacy)).toBe(true);
    expect(await unwrapKekWithPin(legacy, pin)).toBe(kek);
  });

  test("v1 blob with current params still needs upgrade to v2", async () => {
    setPinScryptDeriveForTests(async (password, salt, params) =>
      nobleScrypt(password, salt, {
        N: params.N,
        r: params.r,
        p: params.p,
        dkLen: params.dkLen,
      }),
    );
    const kek = randomKekHex();
    const pin = randomPin();
    const current = await wrapKekWithPin(kek, pin, PIN_SCRYPT);
    const v1 = {
      saltB64: current.saltB64,
      nonceB64: current.nonceB64,
      ciphertextB64: current.ciphertextB64,
      kdf: { ...PIN_SCRYPT },
      v: 1,
    };
    expect(needsPinKdfUpgrade(v1)).toBe(true);
    expect(await unwrapKekWithPin(v1, pin)).toBe(kek);
    expect(needsPinKdfUpgrade(current)).toBe(false);
  });

  test("wrong PIN fails authentication", async () => {
    setPinScryptDeriveForTests(async (password, salt, params) =>
      nobleScrypt(password, salt, {
        N: params.N,
        r: params.r,
        p: params.p,
        dkLen: params.dkLen,
      }),
    );
    const blob = await wrapKekWithPin(randomKekHex(), randomPin(), FAST);
    await expect(unwrapKekWithPin(blob, randomPin())).rejects.toThrow(
      AppAuthError,
    );
  });

  test("serialize/parse preserves blob including kdf and version", async () => {
    setPinScryptDeriveForTests(async (password, salt, params) =>
      nobleScrypt(password, salt, {
        N: params.N,
        r: params.r,
        p: params.p,
        dkLen: params.dkLen,
      }),
    );
    const blob = await wrapKekWithPin(randomKekHex(), randomPin(), FAST);
    const restored = parsePinWrappedKek(serializePinWrappedKek(blob));
    expect(restored).toEqual(blob);
  });

  test("current PIN_SCRYPT is N=2^17 and blob version is 2", () => {
    expect(PIN_SCRYPT.N).toBe(2 ** 17);
    expect(PIN_SCRYPT.r).toBe(8);
    expect(PIN_SCRYPT.p).toBe(1);
    expect(PIN_KEK_BLOB_VERSION).toBe(2);
  });
});
