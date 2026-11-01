import { afterEach, describe, expect, it } from "vitest";
import { scrypt as nobleScrypt } from "@noble/hashes/scrypt.js";

import { bytesToHex } from "@/lib/db/sql-utils";

import {
  needsPinKdfUpgrade,
  PIN_KEK_BLOB_VERSION,
  PIN_SCRYPT,
  PIN_SCRYPT_LEGACY,
  unwrapKekWithPin,
  wrapKekWithPin,
} from "./pin-kek";
import { setPinScryptDeriveForTests } from "./pin-scrypt";

afterEach(() => {
  setPinScryptDeriveForTests(null);
});

describe("pin-kek E2E upgrade path", () => {
  it("unwraps legacy params then rewraps with current params/version", async () => {
    setPinScryptDeriveForTests(async (password, salt, params) =>
      nobleScrypt(password, salt, {
        N: params.N,
        r: params.r,
        p: params.p,
        dkLen: params.dkLen,
      }),
    );

    const kekBytes = new Uint8Array(32);
    crypto.getRandomValues(kekBytes);
    const kek = bytesToHex(kekBytes);
    const pin = `e2e_${crypto.randomUUID().slice(0, 10)}`;

    const legacy = await wrapKekWithPin(kek, pin, PIN_SCRYPT_LEGACY);
    // Strip version to mimic pre-v2 stored blob with legacy params.
    const storedLegacy = {
      saltB64: legacy.saltB64,
      nonceB64: legacy.nonceB64,
      ciphertextB64: legacy.ciphertextB64,
      kdf: { ...PIN_SCRYPT_LEGACY },
    };
    expect(needsPinKdfUpgrade(storedLegacy)).toBe(true);
    expect(await unwrapKekWithPin(storedLegacy, pin)).toBe(kek);

    const upgraded = await wrapKekWithPin(kek, pin, PIN_SCRYPT);
    expect(needsPinKdfUpgrade(upgraded)).toBe(false);
    expect(await unwrapKekWithPin(upgraded, pin)).toBe(kek);
    expect(upgraded.kdf).toEqual(PIN_SCRYPT);
    expect(upgraded.v).toBe(PIN_KEK_BLOB_VERSION);
  });
});
