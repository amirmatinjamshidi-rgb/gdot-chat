import { describe, expect, it } from "vitest";

import { GroupsApi } from "@/lib/api/groups-api";
import { MemoryGroupStore } from "@/lib/db/group-store";
import { MemorySenderKeyStore } from "@/lib/db/sender-key-store";
import { GroupSenderKeyService } from "@/lib/session/group-sender-key-service";

describe("concurrent send during rotation", () => {
  it("both concurrent encrypts succeed after shared rotate", async () => {
    let now = 1_000_000;
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

    const sent: unknown[] = [];
    const api = {
      send: async (_g: string, body: unknown) => {
        sent.push(body);
        return {
          groupId,
          fanOutCount: 1,
          envelopeIds: [crypto.randomUUID()],
        };
      },
    } as unknown as GroupsApi;

    const svc = new GroupSenderKeyService({
      store: new MemorySenderKeyStore(),
      groupStore,
      groupsApi: api,
      localUserId: alice,
      localDeviceId: aliceDev,
      clock: () => ++now,
      listMemberDevices: async (uid) =>
        uid === bob ? [{ deviceId: bobDev }] : [{ deviceId: aliceDev }],
      distribute: async () => undefined,
    });

    await svc.rotateOwnSenderKey(groupId);
    await Promise.all([
      svc.encryptAndSendGroupText(groupId, "a"),
      svc.encryptAndSendGroupText(groupId, "b"),
    ]);
    expect(sent).toHaveLength(2);
  });
});
