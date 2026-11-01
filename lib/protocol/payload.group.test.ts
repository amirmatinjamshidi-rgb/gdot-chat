import { describe, expect, it } from "vitest";
import {
  parseSignalPlaintext,
  serializeGroupControlPayload,
  serializeReceiptPayload,
} from "@/lib/protocol/payload";
import { randomUUID } from "@/lib/crypto/random-id";

describe("group protocol payloads", () => {
  it("round-trips group_control", () => {
    const actor = randomUUID();
    const subject = randomUUID();
    const raw = serializeGroupControlPayload({
      event: "removed",
      actorUserId: actor,
      subjectUserId: subject,
    });
    const parsed = parseSignalPlaintext(raw);
    expect(parsed).toEqual({
      kind: "group_control",
      payload: {
        v: 1,
        t: "group_control",
        event: "removed",
        actorUserId: actor,
        subjectUserId: subject,
      },
    });
  });

  it("round-trips group read receipts", () => {
    const id = randomUUID();
    const groupId = randomUUID();
    const raw = serializeReceiptPayload([id], { kind: "read", groupId });
    const parsed = parseSignalPlaintext(raw);
    expect(parsed.kind).toBe("receipt");
    if (parsed.kind !== "receipt") return;
    expect(parsed.payload.kind).toBe("read");
    expect(parsed.payload.groupId).toBe(groupId);
    expect(parsed.payload.messageIds).toEqual([id]);
  });
});
