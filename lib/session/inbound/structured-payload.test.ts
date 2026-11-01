import { describe, expect, it } from "vitest";

import { parseSignalPlaintext } from "@/lib/protocol/payload";

import { isInvalidStructuredPayload } from "./structured-payload";

describe("isInvalidStructuredPayload", () => {
  it("flags v1 JSON that failed structured parse", () => {
    const raw = JSON.stringify({
      v: 1,
      t: "media",
      kind: "voice",
      attachmentId: "x",
    });
    const parsed = parseSignalPlaintext(raw);
    expect(parsed.kind).toBe("legacy-text");
    expect(isInvalidStructuredPayload(raw, parsed)).toBe(true);
  });

  it("allows true legacy plaintext", () => {
    const parsed = parseSignalPlaintext("hello");
    expect(isInvalidStructuredPayload("hello", parsed)).toBe(false);
  });
});
