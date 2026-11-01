import { describe, expect, it } from "vitest";

import { localMessageToUi } from "@/lib/chat/local-message-ui";
import type { LocalAttachment, LocalMessage } from "@/lib/db/types";
import {
  assertMessageTextWithinLimit,
  MAX_MESSAGE_TEXT_CHARS,
  MESSAGE_TOO_LONG_ERROR,
} from "@/lib/protocol/message-limits";

function msg(
  partial: Partial<LocalMessage> & Pick<LocalMessage, "id">,
): LocalMessage {
  return {
    clientId: "c1",
    conversationId: "g1",
    direction: "incoming",
    kind: "voice",
    plaintext: "",
    status: "delivered",
    senderDeviceId: "dev",
    createdAt: 1_700_000_000_000,
    ...partial,
  };
}

describe("group parity shared message UI + limits (e2e fixtures)", () => {
  it("maps pending inbound voice without uri to transfer card state", () => {
    const attachment: LocalAttachment = {
      attachmentId: "att1",
      messageId: "m1",
      kind: "voice",
      mimeType: "audio/mp4",
      plainSizeBytes: 10,
      durationMs: 1200,
      chunkSize: 1,
      chunkCount: 1,
      mediaKey: new Uint8Array([1]),
      noncePrefix: new Uint8Array([2]),
      transferState: "pending",
      uploadedChunks: [],
      downloadedChunks: [],
      createdAt: 1,
      updatedAt: 1,
    };

    const ui = localMessageToUi(
      msg({ id: "m1", attachmentId: "att1", kind: "voice" }),
      "alice",
      [],
      attachment,
    );
    expect(ui.mediaUri).toBeUndefined();
    expect(ui.transferState).toBe("pending");
    expect(ui.attachmentId).toBe("att1");
    expect(ui.kind).toBe("voice");
  });

  it("rejects overlong text with stable error", () => {
    const tooLong = "x".repeat(MAX_MESSAGE_TEXT_CHARS + 1);
    expect(() => assertMessageTextWithinLimit(tooLong)).toThrow(
      MESSAGE_TOO_LONG_ERROR,
    );
  });
});
