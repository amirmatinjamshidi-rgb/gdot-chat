import { describe, expect, it } from "vitest";

import { GroupsApi } from "@/lib/api/groups-api";
import { MemoryGroupStore } from "@/lib/db/group-store";
import { MemorySenderKeyStore } from "@/lib/db/sender-key-store";
import {
  parseDistribution,
  serializeSenderKeyCiphertext,
  SENDER_KEY_MESSAGE_TYPE,
} from "@/lib/crypto/sender-keys";
import { bytesToBase64, textToBytes, bytesToText, base64ToBytes } from "@/lib/crypto/encoding";
import { GroupSenderKeyService } from "@/lib/session/group-sender-key-service";

function mockGroupsApi(sent: { groupId: string; body: unknown }[]): GroupsApi {
  return {
    send: async (groupId: string, body: unknown) => {
      sent.push({ groupId, body });
      return { groupId, fanOutCount: 1, envelopeIds: [crypto.randomUUID()] };
    },
  } as unknown as GroupsApi;
}

describe("GroupSenderKeyService", () => {
  it("distributes own key to member devices and encrypts group text", async () => {
    let now = 5_000_000;
    const store = new MemorySenderKeyStore();
    const groupStore = new MemoryGroupStore();
    const groupId = crypto.randomUUID();
    const alice = crypto.randomUUID();
    const aliceDev = crypto.randomUUID();
    const bob = crypto.randomUUID();
    const bobDev = crypto.randomUUID();

    await groupStore.upsertGroup({
      id: groupId,
      encryptedMetadata: null,
      createdByUserId: alice,
      createdAt: now,
      myRole: "admin",
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });
    await groupStore.upsertMember({
      groupId,
      userId: alice,
      username: "alice",
      role: "admin",
      joinedAt: now,
      leftAt: null,
    });
    await groupStore.upsertMember({
      groupId,
      userId: bob,
      username: "bob",
      role: "member",
      joinedAt: now,
      leftAt: null,
    });

    const distributed: string[] = [];
    const sent: { groupId: string; body: unknown }[] = [];

    const svc = new GroupSenderKeyService({
      store,
      groupStore,
      groupsApi: mockGroupsApi(sent),
      localUserId: alice,
      localDeviceId: aliceDev,
      clock: () => now,
      listMemberDevices: async (userId) =>
        userId === bob ? [{ deviceId: bobDev }] : [{ deviceId: aliceDev }],
      distribute: async ({ plaintext }) => {
        distributed.push(plaintext);
      },
    });

    await svc.rotateOwnSenderKey(groupId);
    expect(distributed).toHaveLength(1);
    expect(parseDistribution(distributed[0]!)).not.toBeNull();

    // Bob ingests distribution
    const bobSvc = new GroupSenderKeyService({
      store: new MemorySenderKeyStore(),
      groupStore,
      groupsApi: mockGroupsApi([]),
      localUserId: bob,
      localDeviceId: bobDev,
      clock: () => now,
      listMemberDevices: async () => [],
      distribute: async () => undefined,
    });
    // share alice store distribution into bob by ingest
    await bobSvc.ingestDistribution(distributed[0]!);

    const text = `hi_${crypto.randomUUID().slice(0, 6)}`;
    await svc.encryptAndSendGroupText(groupId, text);
    expect(sent).toHaveLength(1);
    const body = sent[0]!.body as {
      messageType: number;
      ciphertextBase64: string;
    };
    expect(body.messageType).toBe(SENDER_KEY_MESSAGE_TYPE);

    const dec = await bobSvc.tryDecryptGroupCiphertext({
      groupId,
      senderUserId: alice,
      senderDeviceId: aliceDev,
      ciphertextBase64: body.ciphertextBase64,
    });
    expect(dec).toEqual({ text });
  });

  it("reports missing_key when distribution absent", async () => {
    const svc = new GroupSenderKeyService({
      store: new MemorySenderKeyStore(),
      groupStore: new MemoryGroupStore(),
      groupsApi: mockGroupsApi([]),
      localUserId: crypto.randomUUID(),
      localDeviceId: crypto.randomUUID(),
      clock: () => 1,
      listMemberDevices: async () => [],
      distribute: async () => undefined,
    });
    const fakeWire = serializeSenderKeyCiphertext({
      v: 1,
      keyId: 1,
      iteration: 0,
      ciphertextB64: bytesToBase64(new Uint8Array([1])),
      macB64: bytesToBase64(new Uint8Array(32)),
      nonceB64: bytesToBase64(new Uint8Array(12)),
    });
    const result = await svc.tryDecryptGroupCiphertext({
      groupId: crypto.randomUUID(),
      senderUserId: crypto.randomUUID(),
      senderDeviceId: crypto.randomUUID(),
      ciphertextBase64: bytesToBase64(textToBytes(fakeWire)),
    });
    expect(result).toBe("missing_key");
  });
});
