import { describe, expect, it } from "vitest";

import { bytesToHex } from "@/lib/db/sql-utils";

import {
  needsPinKdfUpgrade,
  PIN_SCRYPT,
  PIN_SCRYPT_LEGACY,
  unwrapKekWithPin,
  wrapKekWithPin,
} from "./pin-kek";

describe("pin-kek E2E upgrade path", () => {
  it("unwraps legacy params then rewraps with current params", () => {
    const kekBytes = new Uint8Array(32);
    crypto.getRandomValues(kekBytes);
    const kek = bytesToHex(kekBytes);
    const pin = `e2e_${crypto.randomUUID().slice(0, 10)}`;

    const legacy = wrapKekWithPin(kek, pin, PIN_SCRYPT_LEGACY);
    expect(needsPinKdfUpgrade(legacy)).toBe(true);
    expect(unwrapKekWithPin(legacy, pin)).toBe(kek);

    const upgraded = wrapKekWithPin(kek, pin, PIN_SCRYPT);
    expect(needsPinKdfUpgrade(upgraded)).toBe(false);
    expect(unwrapKekWithPin(upgraded, pin)).toBe(kek);
    expect(upgraded.kdf).toEqual(PIN_SCRYPT);
  });
});
