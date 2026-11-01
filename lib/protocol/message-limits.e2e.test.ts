import { describe, expect, it } from "vitest";

import { serializeTextPayload } from "./payload";
import {
  assertMessageTextWithinLimit,
  MAX_MESSAGE_TEXT_CHARS,
  MESSAGE_TOO_LONG_ERROR,
} from "./message-limits";

/**
 * E2E-style: random users' message bodies must be gated before encrypt.
 * Exercises the shared guard + payload serialization path the sync/UI use.
 */
describe("message limits (E2E client path)", () => {
  it("blocks oversize plaintext before encrypt for a random peer message", () => {
    const peerUserId = crypto.randomUUID();
    const oversize = `msg-${peerUserId}-` + "x".repeat(MAX_MESSAGE_TEXT_CHARS);
    expect(oversize.length).toBeGreaterThan(MAX_MESSAGE_TEXT_CHARS);

    expect(() => assertMessageTextWithinLimit(oversize)).toThrow(
      MESSAGE_TOO_LONG_ERROR,
    );
    // Defense: callers must not reach serialize/encrypt when oversize.
    expect(() => {
      assertMessageTextWithinLimit(oversize);
      serializeTextPayload(oversize);
    }).toThrow(MESSAGE_TOO_LONG_ERROR);
  });

  it("allows at-limit text through serialize for a random conversation", () => {
    const conversationId = crypto.randomUUID();
    const text = `ok-${conversationId}-`.padEnd(MAX_MESSAGE_TEXT_CHARS, "y");
    const clipped = text.slice(0, MAX_MESSAGE_TEXT_CHARS);
    expect(clipped.length).toBe(MAX_MESSAGE_TEXT_CHARS);
    expect(() => assertMessageTextWithinLimit(clipped)).not.toThrow();
    const wire = serializeTextPayload(clipped);
    expect(wire).toContain('"t":"text"');
    expect(JSON.parse(wire).text.length).toBe(MAX_MESSAGE_TEXT_CHARS);
  });
});
