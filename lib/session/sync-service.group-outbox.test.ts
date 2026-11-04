import { describe, expect, it, vi } from "vitest";

import { MemoryOutboxStore } from "@/lib/db/outbox-store";
import { MemoryGroupStore } from "@/lib/db/group-store";
import {
  MemoryConversationStore,
  MemoryIdentityStore,
  MemoryMessageStore,
  MemoryReactionStore,
  MemorySessionStore,
} from "@/lib/test/memory-stores";
import { MemoryEnvelopeAttemptStore } from "@/lib/db/envelope-attempt-store";
import { MemoryEnvelopeQuarantineStore } from "@/lib/db/envelope-quarantine-store";
import { OUTBOX_TTL_MS } from "@/lib/session/outbox-constants";
import { SyncService } from "@/lib/session/sync-service";
import { appLockStore } from "@/lib/session/app-lock-store";

describe("Group sends use durable outbox", () => {
  it("sendGroupOutgoing upserts plaintext into outbox with groupId", async () => {
    appLockStore.unlock();
    const clock = { n: 10_000_000, now: () => clock.n };
    const messageStore = new MemoryMessageStore();
    const conversationStore = new MemoryConversationStore();
    const identityStore = new MemoryIdentityStore();
    const sessionStore = new MemorySessionStore();
    const outboxStore = new MemoryOutboxStore();
    const groupStore = new MemoryGroupStore();
    const groupId = crypto.randomUUID();
    const localUserId = crypto.randomUUID();
    const localDeviceId = crypto.randomUUID();

    identityStore.local = {
      userId: localUserId,
      deviceId: localDeviceId,
      username: "alice",
      registrationId: 1,
      identityKeyPublic: new Uint8Array(32),
    };

    await groupStore.upsertGroup({
      id: groupId,
      encryptedMetadata: null,
      createdByUserId: localUserId,
      myRole: "admin",
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
      createdAt: clock.now(),
    });

    const encryptAndSendGroupText = vi.fn(async () => ({
      envelopeIds: ["env-g1"],
    }));
    const encryptAndSendGroupPlaintext = vi.fn(async () => ({
      envelopeIds: ["env-g1"],
    }));

    const sync = new SyncService(
      {
        abortBackground: async () => undefined,
        send: async () => ({ envelopeId: crypto.randomUUID() }),
        getPending: async () => [],
      } as never,
      {
        runWithTransportPaused: async <T>(fn: () => Promise<T>) => fn(),
        setPreKeysLowHandler: () => undefined,
        setSessionResetHandler: () => undefined,
        setEnvelopeHandler: () => undefined,
        setConnectionHandler: () => undefined,
        setGroupMembershipChangedHandler: () => undefined,
        isConnected: () => false,
        connect: async () => undefined,
        disconnect: async () => undefined,
      } as never,
      {
        encryptOutgoing: async () => ({
          recipientUserId: "x",
          recipientDeviceId: "y",
          messageType: 2,
          ciphertextBase64: "QQ==",
        }),
        replenishLocalPreKeysIfNeeded: async () => undefined,
      } as never,
      messageStore,
      conversationStore,
      identityStore,
      {
        getAccessToken: async () => "tok",
        getDeviceId: async () => localDeviceId,
        clearSessionExpired: async () => undefined,
      } as never,
      new MemoryReactionStore(),
      null,
      {
        quarantineStore: new MemoryEnvelopeQuarantineStore(),
        attemptStore: new MemoryEnvelopeAttemptStore(),
        sessionResetApi: { request: async () => undefined } as never,
        sessionStore,
        outboxStore,
        clock: () => clock.now(),
        groupStore,
        groupSenderKeyService: {
          setLocalIdentity: () => undefined,
          encryptAndSendGroupText,
          encryptAndSendGroupPlaintext,
          catchUpForLinkedDevice: async () => undefined,
          handleMembershipChanged: async () => undefined,
          tryDecryptGroupCiphertext: async () => "failed" as const,
        } as never,
      },
    );

    await sync.sendGroupOutgoing(groupId, "hello group outbox");

    const pending = await outboxStore.listPendingGroups(clock.now());
    expect(pending).toHaveLength(1);
    expect(pending[0]?.plaintext).toBe("hello group outbox");
    expect(pending[0]?.groupId).toBe(groupId);
    expect(pending[0]?.payloadKind).toBe("text");
    expect(pending[0]?.expiresAt).toBe(clock.now() + OUTBOX_TTL_MS);
    expect(encryptAndSendGroupText).toHaveBeenCalledOnce();

    const entry = pending[0]!;
    const local = await messageStore.getByClientId(entry.clientMessageId);
    expect(local).toBeTruthy();
    await messageStore.updateStatus(local!.id, "failed");
    encryptAndSendGroupPlaintext.mockClear();
    await sync.flushGroupOutbox();
    expect(encryptAndSendGroupPlaintext).toHaveBeenCalledWith(
      groupId,
      "hello group outbox",
    );
    const after = await messageStore.getById(local!.id);
    expect(after?.status).toBe("sent");
  });
});
