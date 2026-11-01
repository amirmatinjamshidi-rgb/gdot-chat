import { describe, expect, it } from "vitest";

import { binaryStringToBytes } from "@/lib/crypto/buffer-utils";

describe("binaryStringToBytes (encoding fix unit)", () => {
  it("preserves high bytes 1:1 unlike TextEncoder", () => {
    const chars = Array.from({ length: 256 }, (_, i) => String.fromCharCode(i)).join("");
    const fixed = binaryStringToBytes(chars);
    expect(fixed.length).toBe(256);
    expect(fixed[0x80]).toBe(0x80);
    expect(fixed[0xff]).toBe(0xff);

    const broken = new TextEncoder().encode(chars);
    expect(broken.length).toBeGreaterThan(256);
  });
});
