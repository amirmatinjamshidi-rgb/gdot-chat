import { describe, expect, it } from "vitest";

import { MemoryOutboxStore } from "@/lib/db/outbox-store";
import {
  MemoryConversationStore,
  MemoryIdentityStore,
  MemoryMessageStore,
  MemoryReactionStore,
  MemorySessionStore,
} from "@/lib/test/memory-stores";
import { MemoryEnvelopeAttemptStore } from "@/lib/db/envelope-attempt-store";
import { MemoryEnvelopeQuarantineStore } from "@/lib/db/envelope-quarantine-store";
import { SyncService } from "@/lib/session/sync-service";

describe("Multi-device fan-out", () => {
  it("encrypts once per peer device and own other devices", async () => {
    let now = 50_000;
    const clock = () => now;

    const aliceUser = crypto.randomUUID();
    const aliceDevice = crypto.randomUUID();
    const aliceOther = crypto.randomUUID();
    const bobUser = crypto.randomUUID();
    const bobDeviceA = crypto.randomUUID();
    const bobDeviceB = crypto.randomUUID();
    const conversationId = crypto.randomUUID();

    const sent: { userId: string; deviceId: string; plaintext: string }[] = [];

    const identity = new MemoryIdentityStore();
    identity.local = {
      userId: aliceUser,
      deviceId: aliceDevice,
      username: "alice",
      registrationId: 1,
      identityKeyPublic: new Uint8Array(32),
    };
    const conversations = new MemoryConversationStore();
    conversations.conversations.set(conversationId, {
      id: conversationId,
      peerUserId: bobUser,
      peerUsername: "bob",
      peerDeviceId: bobDeviceA,
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });

    const sync = new SyncService(
      {
        abortBackground: async () => undefined,
        send: async (req: {
          recipientUserId: string;
          recipientDeviceId: string;
          ciphertextBase64: string;
        }) => {
          sent.push({
            userId: req.recipientUserId,
            deviceId: req.recipientDeviceId,
            plaintext: Buffer.from(req.ciphertextBase64, "base64").toString("utf8"),
          });
          return { envelopeId: crypto.randomUUID() };
        },
      } as never,
      {
        runWithTransportPaused: async <T>(fn: () => Promise<T>) => fn(),
        setPreKeysLowHandler: () => undefined,
        setSessionResetHandler: () => undefined,
        setEnvelopeHandler: () => undefined,
        setConnectionHandler: () => undefined,
      } as never,
      {
        encryptOutgoing: async (userId: string, deviceId: string, plaintext: string) => ({
          recipientUserId: userId,
          recipientDeviceId: deviceId,
          messageType: 2,
          ciphertextBase64: Buffer.from(plaintext).toString("base64"),
        }),
        replenishLocalPreKeysIfNeeded: async () => undefined,
      } as never,
      new MemoryMessageStore(),
      conversations,
      identity,
      {
        getAccessToken: async () => "tok",
        clearSessionExpired: async () => undefined,
      } as never,
      new MemoryReactionStore(),
      null,
      {
        quarantineStore: new MemoryEnvelopeQuarantineStore(),
        attemptStore: new MemoryEnvelopeAttemptStore(),
        sessionResetApi: { request: async () => undefined } as never,
        sessionStore: new MemorySessionStore(),
        outboxStore: new MemoryOutboxStore(),
        clock,
        deviceDirectory: {
          listPeerDevices: async () => [
            { deviceId: bobDeviceA },
            { deviceId: bobDeviceB },
          ],
          listOwnDevices: async () => [
            { deviceId: aliceDevice },
            { deviceId: aliceOther },
          ],
        },
      },
    );

    const conversation = (await conversations.getById(conversationId))!;
    await sync.encryptAndPost(conversation, "hello-fanout");

    const deviceIds = sent.map((s) => s.deviceId).sort();
    expect(deviceIds).toEqual(
      [aliceOther, bobDeviceA, bobDeviceB].sort(),
    );
    expect(sent.every((s) => s.plaintext === "hello-fanout")).toBe(true);
    expect(sent.find((s) => s.deviceId === aliceDevice)).toBeUndefined();
  });
});

describe("Multi-device fan-out E2E", () => {
  it("sendOutgoing fans out with random users/devices (injected clock)", async () => {
    let now = 99_000;
    const aliceUser = crypto.randomUUID();
    const aliceDevice = crypto.randomUUID();
    const bobUser = crypto.randomUUID();
    const bobD1 = crypto.randomUUID();
    const bobD2 = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    const sends: string[] = [];

    const identity = new MemoryIdentityStore();
    identity.local = {
      userId: aliceUser,
      deviceId: aliceDevice,
      username: "a",
      registrationId: 1,
      identityKeyPublic: new Uint8Array(32),
    };
    const conversations = new MemoryConversationStore();
    conversations.conversations.set(conversationId, {
      id: conversationId,
      peerUserId: bobUser,
      peerUsername: "b",
      peerDeviceId: bobD1,
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });
    const messages = new MemoryMessageStore();
    const outbox = new MemoryOutboxStore();

    const sync = new SyncService(
      {
        abortBackground: async () => undefined,
        send: async (req: { recipientDeviceId: string }) => {
          sends.push(req.recipientDeviceId);
          return { envelopeId: crypto.randomUUID() };
        },
      } as never,
      {
        runWithTransportPaused: async <T>(fn: () => Promise<T>) => fn(),
        setPreKeysLowHandler: () => undefined,
        setSessionResetHandler: () => undefined,
        setEnvelopeHandler: () => undefined,
        setConnectionHandler: () => undefined,
      } as never,
      {
        encryptOutgoing: async (u: string, d: string, p: string) => ({
          recipientUserId: u,
          recipientDeviceId: d,
          messageType: 2,
          ciphertextBase64: Buffer.from(p).toString("base64"),
        }),
        replenishLocalPreKeysIfNeeded: async () => undefined,
      } as never,
      messages,
      conversations,
      identity,
      {
        getAccessToken: async () => "tok",
        clearSessionExpired: async () => undefined,
        getDeviceId: async () => aliceDevice,
      } as never,
      new MemoryReactionStore(),
      null,
      {
        quarantineStore: new MemoryEnvelopeQuarantineStore(),
        attemptStore: new MemoryEnvelopeAttemptStore(),
        sessionResetApi: { request: async () => undefined } as never,
        sessionStore: new MemorySessionStore(),
        outboxStore: outbox,
        clock: () => now,
        deviceDirectory: {
          listPeerDevices: async () => [{ deviceId: bobD1 }, { deviceId: bobD2 }],
          listOwnDevices: async () => [{ deviceId: aliceDevice }],
        },
      },
    );

    await sync.sendOutgoing(conversationId, "fanout-e2e");
    expect(new Set(sends)).toEqual(new Set([bobD1, bobD2]));
    const pending = await outbox.listPendingForPeerDevice(bobD1, now);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.payloadKind).toBe("text");
  });
});
