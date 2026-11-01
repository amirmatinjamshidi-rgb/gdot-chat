import { describe, expect, it } from "vitest";

import {
  assertMessageTextWithinLimit,
  MAX_MESSAGE_TEXT_CHARS,
  MESSAGE_TOO_LONG_ERROR,
} from "./message-limits";

describe("message text limits", () => {
  it("allows empty and exactly-at-limit text", () => {
    expect(() => assertMessageTextWithinLimit("")).not.toThrow();
    expect(() =>
      assertMessageTextWithinLimit("a".repeat(MAX_MESSAGE_TEXT_CHARS)),
    ).not.toThrow();
  });

  it("rejects one character over the limit with a clear error", () => {
    expect(() =>
      assertMessageTextWithinLimit("a".repeat(MAX_MESSAGE_TEXT_CHARS + 1)),
    ).toThrow(MESSAGE_TOO_LONG_ERROR);
  });
});
