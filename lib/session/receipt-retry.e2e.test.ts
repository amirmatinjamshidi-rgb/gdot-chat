import { describe, expect, it } from "vitest";

import { MemoryPendingReceiptStore } from "@/lib/db/pending-receipt-store";
import {
  MemoryConversationStore,
  MemoryMessageStore,
  MemoryReactionStore,
} from "@/lib/test/memory-stores";
import { MemoryEnvelopeAttemptStore, MemorySessionResetCooldownStore } from "@/lib/db/envelope-attempt-store";
import { MemoryEnvelopeQuarantineStore } from "@/lib/db/envelope-quarantine-store";
import { bytesToBase64 } from "@/lib/crypto/encoding";
import { serializeTextPayload, parseSignalPlaintext } from "@/lib/protocol/payload";
import { InboundEnvelopeProcessor } from "@/lib/session/inbound/inbound-envelope-processor";
import { ReceiptRetryService } from "@/lib/session/receipt-retry";

/**
 * E2E: inbound decrypt → receipt send fails → persisted → clock advance → flush succeeds.
 */
describe("delivery receipt retry E2E", () => {
  it("retries failed receipt after inbound text until send succeeds", async () => {
    let now = 8_000_000;
    const conversationId = crypto.randomUUID();
    const peerUserId = crypto.randomUUID();
    const peerDeviceId = crypto.randomUUID();
    const clientMessageId = crypto.randomUUID();
    const envelopeId = crypto.randomUUID();

    const conversationStore = new MemoryConversationStore();
    await conversationStore.upsert({
      id: conversationId,
      peerUserId,
      peerUsername: `peer_${peerUserId.slice(0, 6)}`,
      peerDeviceId,
      lastMessagePreview: "",
      lastMessageAt: now,
      unreadCount: 0,
    });

    const pending = new MemoryPendingReceiptStore();
    let failSend = true;
    const sent: string[] = [];
    const conversation = (await conversationStore.getById(conversationId))!;

    const receiptRetry = new ReceiptRetryService({
      store: pending,
      sendEncrypted: async (_c, plaintext) => {
        if (failSend) throw new Error("network down");
        sent.push(plaintext);
      },
      getConversation: async (id) => conversationStore.getById(id),
      clock: () => now,
      random: () => 0,
    });

    const processor = new InboundEnvelopeProcessor({
      messagesApi: { ack: async () => undefined } as never,
      signalService: {
        decryptIncoming: async () =>
          serializeTextPayload("hello-e2e", clientMessageId),
        getIdentityTrust: async () => ({
          keyChanged: false,
          verified: false,
          hasRemote: true,
        }),
      } as never,
      messageStore: new MemoryMessageStore(),
      conversationStore,
      reactionStore: new MemoryReactionStore(),
      quarantineStore: new MemoryEnvelopeQuarantineStore(),
      attemptStore: new MemoryEnvelopeAttemptStore(),
      sessionResetApi: { request: async () => undefined } as never,
      sessionResetCooldown: new MemorySessionResetCooldownStore(),
      mediaTransfer: null,
      receiptRetry,
      isDbReady: () => true,
      clock: () => now,
    });

    await processor.processEnvelope({
      id: envelopeId,
      senderUserId: peerUserId,
      senderDeviceId: peerDeviceId,
      recipientDeviceId: crypto.randomUUID(),
      messageType: 3,
      ciphertextBase64: bytesToBase64(new Uint8Array([1, 2, 3])),
      createdAt: new Date(now).toISOString(),
    } as never);

    expect(await pending.count()).toBe(1);
    expect(sent).toHaveLength(0);

    const row = await pending.get(clientMessageId);
    expect(row).not.toBeNull();
    now = row!.nextAttemptAt;
    failSend = false;
    expect(await receiptRetry.flushDue()).toBe(1);
    expect(sent).toHaveLength(1);
    const parsed = parseSignalPlaintext(sent[0]!);
    expect(parsed.kind).toBe("receipt");
    if (parsed.kind === "receipt") {
      expect(parsed.payload.messageIds).toEqual([clientMessageId]);
    }
    expect(await pending.count()).toBe(0);
  });
});
