import { describe, expect, it } from "vitest";

import type { GroupsApi } from "@/lib/api/groups-api";
import { MemoryGroupStore } from "@/lib/db/group-store";
import { MemorySenderKeyStore } from "@/lib/db/sender-key-store";
import { GroupSenderKeyService } from "@/lib/session/group-sender-key-service";

type Device = { userId: string; deviceId: string; name: string };

/**
 * In-memory multi-party bus: 1:1 distribute delivers plaintext instantly
 * to the recipient device's GroupSenderKeyService.
 */
function createHarness(nowRef: { now: number }) {
  const groupId = crypto.randomUUID();
  const alice: Device = {
    userId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    name: "alice",
  };
  const alicePhone: Device = {
    userId: alice.userId,
    deviceId: crypto.randomUUID(),
    name: "alice-phone",
  };
  const bob: Device = {
    userId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    name: "bob",
  };
  const carol: Device = {
    userId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    name: "carol",
  };

  const devicesByUser = new Map<string, Device[]>([
    [alice.userId, [alice, alicePhone]],
    [bob.userId, [bob]],
    [carol.userId, [carol]],
  ]);

  const groupStore = new MemoryGroupStore();
  const services = new Map<string, GroupSenderKeyService>();
  const stores = new Map<string, MemorySenderKeyStore>();
  const sentCipher: {
    senderUserId: string;
    senderDeviceId: string;
    ciphertextBase64: string;
  }[] = [];

  const makeApi = (sender: Device): GroupsApi =>
    ({
      send: async (_groupId: string, body: { ciphertextBase64: string }) => {
        sentCipher.push({
          senderUserId: sender.userId,
          senderDeviceId: sender.deviceId,
          ciphertextBase64: body.ciphertextBase64,
        });
        return {
          groupId,
          fanOutCount: 3,
          envelopeIds: [crypto.randomUUID()],
        };
      },
    }) as unknown as GroupsApi;

  function makeSvc(dev: Device): GroupSenderKeyService {
    const store = new MemorySenderKeyStore();
    stores.set(dev.deviceId, store);
    const svc = new GroupSenderKeyService({
      store,
      groupStore,
      groupsApi: makeApi(dev),
      localUserId: dev.userId,
      localDeviceId: dev.deviceId,
      clock: () => nowRef.now,
      listMemberDevices: async (userId) =>
        (devicesByUser.get(userId) ?? []).map((d) => ({
          deviceId: d.deviceId,
        })),
      distribute: async ({ recipientUserId, recipientDeviceId, plaintext }) => {
        const target = services.get(recipientDeviceId);
        if (!target) return;
        await target.ingestControlPlaintext(plaintext);
      },
      resolveUsername: async (userId) => {
        for (const list of devicesByUser.values()) {
          const hit = list.find((d) => d.userId === userId);
          if (hit) return hit.name.split("-")[0]!;
        }
        return null;
      },
    });
    services.set(dev.deviceId, svc);
    return svc;
  }

  const aliceSvc = makeSvc(alice);
  const alicePhoneSvc = makeSvc(alicePhone);
  const bobSvc = makeSvc(bob);
  const carolSvc = makeSvc(carol);

  return {
    groupId,
    alice,
    alicePhone,
    bob,
    carol,
    groupStore,
    aliceSvc,
    alicePhoneSvc,
    bobSvc,
    carolSvc,
    sentCipher,
    services,
  };
}

describe("group chat multi-user E2E", () => {
  it("3 users (alice 2 devices): add/remove; removed cannot decrypt", async () => {
    const nowRef = { now: 10_000_000 };
    const h = createHarness(nowRef);

    await h.groupStore.upsertGroup({
      id: h.groupId,
      encryptedMetadata: null,
      createdByUserId: h.alice.userId,
      createdAt: nowRef.now,
      myRole: "admin",
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    });
    for (const [userId, username, role] of [
      [h.alice.userId, "alice", "admin"],
      [h.bob.userId, "bob", "member"],
      [h.carol.userId, "carol", "member"],
    ] as const) {
      await h.groupStore.upsertMember({
        groupId: h.groupId,
        userId,
        username,
        role,
        joinedAt: nowRef.now,
        leftAt: null,
      });
    }

    // Initial key distribution from each member (incl. alice's second device catch-up)
    await h.aliceSvc.rotateOwnSenderKey(h.groupId);
    await h.alicePhoneSvc.catchUpForLinkedDevice(h.groupId);
    await h.bobSvc.rotateOwnSenderKey(h.groupId);
    await h.carolSvc.rotateOwnSenderKey(h.groupId);

    await h.aliceSvc.encryptAndSendGroupText(h.groupId, "hello-all");
    const wire1 = h.sentCipher.at(-1)!;

    for (const svc of [h.bobSvc, h.carolSvc, h.alicePhoneSvc]) {
      const dec = await svc.tryDecryptGroupCiphertext({
        groupId: h.groupId,
        senderUserId: wire1.senderUserId,
        senderDeviceId: wire1.senderDeviceId,
        ciphertextBase64: wire1.ciphertextBase64,
      });
      expect(dec).toEqual({ text: "hello-all" });
    }

    // Remove carol → remaining members rotate via membership handler
    nowRef.now += 1000;
    await h.aliceSvc.handleMembershipChanged({
      groupId: h.groupId,
      change: "removed",
      actorUserId: h.alice.userId,
      subjectUserId: h.carol.userId,
      at: nowRef.now,
    });
    await h.bobSvc.handleMembershipChanged({
      groupId: h.groupId,
      change: "removed",
      actorUserId: h.alice.userId,
      subjectUserId: h.carol.userId,
      at: nowRef.now,
    });
    await h.alicePhoneSvc.handleMembershipChanged({
      groupId: h.groupId,
      change: "removed",
      actorUserId: h.alice.userId,
      subjectUserId: h.carol.userId,
      at: nowRef.now,
    });
    // Carol also learns she was removed (no rotate if not still in)
    await h.carolSvc.handleMembershipChanged({
      groupId: h.groupId,
      change: "removed",
      actorUserId: h.alice.userId,
      subjectUserId: h.carol.userId,
      at: nowRef.now,
    });

    await h.aliceSvc.encryptAndSendGroupText(h.groupId, "secret-after-remove");
    const wire2 = h.sentCipher.at(-1)!;

    const bobOk = await h.bobSvc.tryDecryptGroupCiphertext({
      groupId: h.groupId,
      senderUserId: wire2.senderUserId,
      senderDeviceId: wire2.senderDeviceId,
      ciphertextBase64: wire2.ciphertextBase64,
    });
    expect(bobOk).toEqual({ text: "secret-after-remove" });

    const phoneOk = await h.alicePhoneSvc.tryDecryptGroupCiphertext({
      groupId: h.groupId,
      senderUserId: wire2.senderUserId,
      senderDeviceId: wire2.senderDeviceId,
      ciphertextBase64: wire2.ciphertextBase64,
    });
    expect(phoneOk).toEqual({ text: "secret-after-remove" });

    const carolDenied = await h.carolSvc.tryDecryptGroupCiphertext({
      groupId: h.groupId,
      senderUserId: wire2.senderUserId,
      senderDeviceId: wire2.senderDeviceId,
      ciphertextBase64: wire2.ciphertextBase64,
    });
    expect(carolDenied).toBe("missing_key");

    // Re-add carol → catch-up keys so she can read new (not old secret)
    nowRef.now += 1000;
    await h.groupStore.upsertMember({
      groupId: h.groupId,
      userId: h.carol.userId,
      username: "carol",
      role: "member",
      joinedAt: nowRef.now,
      leftAt: null,
    });
    await h.aliceSvc.handleMembershipChanged({
      groupId: h.groupId,
      change: "added",
      actorUserId: h.alice.userId,
      subjectUserId: h.carol.userId,
      at: nowRef.now,
    });
    await h.bobSvc.handleMembershipChanged({
      groupId: h.groupId,
      change: "added",
      actorUserId: h.alice.userId,
      subjectUserId: h.carol.userId,
      at: nowRef.now,
    });
    await h.carolSvc.handleMembershipChanged({
      groupId: h.groupId,
      change: "added",
      actorUserId: h.alice.userId,
      subjectUserId: h.carol.userId,
      at: nowRef.now,
    });

    await h.bobSvc.encryptAndSendGroupText(h.groupId, "welcome-back");
    const wire3 = h.sentCipher.at(-1)!;
    const carolOk = await h.carolSvc.tryDecryptGroupCiphertext({
      groupId: h.groupId,
      senderUserId: wire3.senderUserId,
      senderDeviceId: wire3.senderDeviceId,
      ciphertextBase64: wire3.ciphertextBase64,
    });
    expect(carolOk).toEqual({ text: "welcome-back" });
  });
});
