import { describe, expect, it } from "vitest";

import { GroupsApi } from "@/lib/api/groups-api";
import { MemoryGroupStore } from "@/lib/db/group-store";
import { MemorySenderKeyStore } from "@/lib/db/sender-key-store";
import { GroupSenderKeyService } from "@/lib/session/group-sender-key-service";

describe("GroupSenderKeyService E2E remove→rotate", () => {
  it("rotated key after remove: old bob state cannot decrypt", async () => {
    let now = 9_000_000;
    const groupId = crypto.randomUUID();
    const alice = crypto.randomUUID();
    const aliceDev = crypto.randomUUID();
    const bob = crypto.randomUUID();
    const bobDev = crypto.randomUUID();

    const groupStore = new MemoryGroupStore();
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
    for (const [userId, username, role] of [
      [alice, "alice", "admin"],
      [bob, "bob", "member"],
    ] as const) {
      await groupStore.upsertMember({
        groupId,
        userId,
        username,
        role,
        joinedAt: now,
        leftAt: null,
      });
    }

    const aliceStore = new MemorySenderKeyStore();
    const bobStore = new MemorySenderKeyStore();
    const sent: { ciphertextBase64: string }[] = [];
    const dists: string[] = [];

    const makeApi = (): GroupsApi =>
      ({
        send: async (_g: string, body: { ciphertextBase64: string }) => {
          sent.push(body);
          return {
            groupId,
            fanOutCount: 1,
            envelopeIds: [crypto.randomUUID()],
          };
        },
      }) as unknown as GroupsApi;

    const aliceSvc = new GroupSenderKeyService({
      store: aliceStore,
      groupStore,
      groupsApi: makeApi(),
      localUserId: alice,
      localDeviceId: aliceDev,
      clock: () => now,
      listMemberDevices: async (uid) =>
        uid === bob ? [{ deviceId: bobDev }] : [{ deviceId: aliceDev }],
      distribute: async ({ plaintext }) => {
        dists.push(plaintext);
      },
    });

    const bobSvc = new GroupSenderKeyService({
      store: bobStore,
      groupStore,
      groupsApi: makeApi(),
      localUserId: bob,
      localDeviceId: bobDev,
      clock: () => now,
      listMemberDevices: async () => [],
      distribute: async () => undefined,
    });

    await aliceSvc.rotateOwnSenderKey(groupId);
    await bobSvc.ingestDistribution(dists.at(-1)!);
    await aliceSvc.encryptAndSendGroupText(groupId, "visible");
    const ok = await bobSvc.tryDecryptGroupCiphertext({
      groupId,
      senderUserId: alice,
      senderDeviceId: aliceDev,
      ciphertextBase64: sent.at(-1)!.ciphertextBase64,
    });
    expect(ok).toEqual({ text: "visible" });

    // Remove bob locally + alice rotates (as required on membership change)
    await groupStore.markMemberLeft(groupId, bob, now);
    dists.length = 0;
    await aliceSvc.rotateOwnSenderKey(groupId);
    expect(dists.length).toBe(0); // bob no longer member — no distribute to bob

    await aliceSvc.encryptAndSendGroupText(groupId, "secret");
    const denied = await bobSvc.tryDecryptGroupCiphertext({
      groupId,
      senderUserId: alice,
      senderDeviceId: aliceDev,
      ciphertextBase64: sent.at(-1)!.ciphertextBase64,
    });
    expect(denied).toBe("missing_key");
  });
});
