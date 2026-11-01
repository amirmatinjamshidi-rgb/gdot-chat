import { describe, expect, it } from "vitest";

import { MemoryOutboxStore } from "@/lib/db/outbox-store";
import {
  OUTBOX_MAX_PER_CONVERSATION,
  OUTBOX_MAX_RESENDS,
  OUTBOX_TTL_MS,
} from "@/lib/session/outbox-constants";

describe("MemoryOutboxStore", () => {
  it("stores pending plaintext until receipt then purges", async () => {
    const store = new MemoryOutboxStore();
    const now = 1_000_000;
    const clientMessageId = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const peerDeviceId = crypto.randomUUID();

    await store.upsertPending({
      clientMessageId,
      localMessageId: crypto.randomUUID(),
      conversationId,
      peerUserId: crypto.randomUUID(),
      peerDeviceId,
      plaintext: "secret-outbox",
      createdAt: now,
      expiresAt: now + OUTBOX_TTL_MS,
    });

    const pending = await store.listPendingForPeerDevice(peerDeviceId, now);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.plaintext).toBe("secret-outbox");

    expect(await store.markReceipted(clientMessageId, now + 10)).toBe(true);
    expect(await store.listPendingForPeerDevice(peerDeviceId, now + 10)).toHaveLength(
      0,
    );
    expect(await store.purgeReceipted()).toBe(1);
    expect(await store.get(clientMessageId)).toBeNull();
  });

  it("purges expired entries via injected clock time", async () => {
    const store = new MemoryOutboxStore();
    const now = 5_000_000;
    const peerDeviceId = crypto.randomUUID();
    await store.upsertPending({
      clientMessageId: crypto.randomUUID(),
      localMessageId: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
      peerUserId: crypto.randomUUID(),
      peerDeviceId,
      plaintext: "old",
      createdAt: now,
      expiresAt: now + 100,
    });
    expect(await store.listPendingForPeerDevice(peerDeviceId, now)).toHaveLength(1);
    expect(await store.purgeExpired(now + 101)).toBe(1);
    expect(await store.listPendingForPeerDevice(peerDeviceId, now + 101)).toHaveLength(
      0,
    );
  });

  it("trims oldest pending beyond max per conversation", async () => {
    const store = new MemoryOutboxStore();
    const conversationId = crypto.randomUUID();
    const peerDeviceId = crypto.randomUUID();
    const now = 2_000_000;
    const max = 3;
    for (let i = 0; i < max + 2; i++) {
      await store.upsertPending({
        clientMessageId: crypto.randomUUID(),
        localMessageId: crypto.randomUUID(),
        conversationId,
        peerUserId: crypto.randomUUID(),
        peerDeviceId,
        plaintext: `m-${i}`,
        createdAt: now + i,
        expiresAt: now + OUTBOX_TTL_MS,
      });
    }
    const dropped = await store.trimConversation(conversationId, max);
    expect(dropped).toBe(2);
    const left = await store.listPendingForConversation(
      conversationId,
      now,
    );
    expect(left).toHaveLength(max);
    expect(left.map((e) => e.plaintext)).toEqual(["m-2", "m-3", "m-4"]);
    expect(OUTBOX_MAX_PER_CONVERSATION).toBeGreaterThan(0);
    expect(OUTBOX_MAX_RESENDS).toBeGreaterThan(0);
  });

  it("increments resend count for loop protection", async () => {
    const store = new MemoryOutboxStore();
    const id = crypto.randomUUID();
    const now = 3_000_000;
    await store.upsertPending({
      clientMessageId: id,
      localMessageId: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
      peerUserId: crypto.randomUUID(),
      peerDeviceId: crypto.randomUUID(),
      plaintext: "x",
      createdAt: now,
      expiresAt: now + OUTBOX_TTL_MS,
    });
    expect(await store.incrementResend(id, now + 1)).toBe(1);
    expect(await store.incrementResend(id, now + 2)).toBe(2);
    expect(await store.incrementResend(id, now + 3)).toBe(3);
  });
});
