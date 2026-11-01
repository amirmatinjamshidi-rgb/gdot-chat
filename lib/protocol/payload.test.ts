import { describe, expect, test } from "vitest";
import {
  parseSignalPlaintext,
  serializeMediaPayload,
  serializeReactionPayload,
  serializeTextPayload,
  SIGNAL_PAYLOAD_VERSION,
  type MediaPayload,
} from "./payload";
import { encodeMediaKey, encodeNoncePrefix } from "./payload";
import { MEDIA_ALGORITHM } from "./payload";

describe("typed Signal plaintext protocol", () => {
  test("serializes and parses v1 text", () => {
    const raw = serializeTextPayload("hello");
    const parsed = parseSignalPlaintext(raw);
    expect(parsed).toEqual({
      kind: "text",
      payload: { v: 1, t: "text", text: "hello" },
    });
  });

  test("treats legacy plaintext as text", () => {
    expect(parseSignalPlaintext("hello")).toEqual({
      kind: "legacy-text",
      text: "hello",
    });
    expect(parseSignalPlaintext("{not json")).toEqual({
      kind: "legacy-text",
      text: "{not json",
    });
    expect(parseSignalPlaintext(JSON.stringify({ v: 2, t: "text", text: "x" }))).toEqual({
      kind: "legacy-text",
      text: JSON.stringify({ v: 2, t: "text", text: "x" }),
    });
  });

  test("parses a valid media descriptor", () => {
    const key = new Uint8Array(32).fill(7);
    const nonce = new Uint8Array(8).fill(3);
    const payload: MediaPayload = {
      v: SIGNAL_PAYLOAD_VERSION,
      t: "media",
      kind: "voice",
      attachmentId: "11111111-1111-1111-1111-111111111111",
      algorithm: MEDIA_ALGORITHM,
      size: 100,
      chunkSize: 4 * 1024 * 1024,
      chunkCount: 1,
      mimeType: "audio/mp4",
      durationMs: 1200,
      key: encodeMediaKey(key),
      noncePrefix: encodeNoncePrefix(nonce),
    };
    const parsed = parseSignalPlaintext(serializeMediaPayload(payload));
    expect(parsed.kind).toBe("media");
    if (parsed.kind === "media") {
      expect(parsed.payload.attachmentId).toBe(payload.attachmentId);
      expect(parsed.payload.key).toBe(payload.key);
    }
  });

  test("rejects media descriptor with wrong chunkCount", () => {
    const raw = JSON.stringify({
      v: 1,
      t: "media",
      kind: "video",
      attachmentId: "11111111-1111-1111-1111-111111111111",
      algorithm: MEDIA_ALGORITHM,
      size: 10,
      chunkSize: 4,
      chunkCount: 99,
      mimeType: "video/mp4",
      key: encodeMediaKey(new Uint8Array(32)),
      noncePrefix: encodeNoncePrefix(new Uint8Array(8)),
    });
    expect(parseSignalPlaintext(raw).kind).toBe("legacy-text");
  });

  test("does not treat random JSON as a media bubble", () => {
    const raw = JSON.stringify({ v: 1, t: "media", kind: "voice" });
    const parsed = parseSignalPlaintext(raw);
    expect(parsed.kind).toBe("legacy-text");
  });

  test("serializes and parses v1 reaction add/remove", () => {
    const add = serializeReactionPayload({
      op: "add",
      targetServerEnvelopeId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      emoji: "👍",
    });
    expect(parseSignalPlaintext(add)).toEqual({
      kind: "reaction",
      payload: {
        v: 1,
        t: "reaction",
        op: "add",
        targetServerEnvelopeId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        emoji: "👍",
      },
    });
    const remove = serializeReactionPayload({
      op: "remove",
      targetServerEnvelopeId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      emoji: "👍",
    });
    expect(parseSignalPlaintext(remove).kind).toBe("reaction");
  });

  test("rejects malformed reaction payloads", () => {
    expect(
      parseSignalPlaintext(
        JSON.stringify({ v: 1, t: "reaction", op: "add", emoji: "👍" }),
      ).kind,
    ).toBe("legacy-text");
    expect(
      parseSignalPlaintext(
        JSON.stringify({
          v: 1,
          t: "reaction",
          op: "toggle",
          targetServerEnvelopeId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          emoji: "👍",
        }),
      ).kind,
    ).toBe("legacy-text");
  });
});
