import type { GroupsApi } from "@/lib/api/groups-api";
import {
  createSendingSenderKeyState,
  decryptSenderKey,
  encryptSenderKey,
  parseDistribution,
  parseSenderKeyCiphertext,
  serializeDistribution,
  serializeSenderKeyCiphertext,
  stateFromDistribution,
  toDistribution,
  SenderKeyError,
  SENDER_KEY_MESSAGE_TYPE,
  type SenderKeyState,
} from "@/lib/crypto/sender-keys";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToText,
  textToBytes,
} from "@/lib/crypto/encoding";
import type { IGroupStore } from "@/lib/db/group-store";
import type { ISenderKeyStore } from "@/lib/db/sender-key-store";
import type { IMessageStore } from "@/lib/db/message-store";
import type { LocalMessage } from "@/lib/db/types";
import { randomUUID } from "@/lib/crypto/random-id";
import type { Clock } from "@/lib/session/inbound/constants";
import { systemClock } from "@/lib/session/inbound/constants";
import {
  formatGroupSystemMessage,
  parseSenderKeyRequest,
  serializeSenderKeyRequest,
  type GroupSystemEvent,
} from "@/lib/session/group-control-payload";
import {
  serializeGroupControlPayload,
  type GroupControlEvent,
} from "@/lib/protocol/payload";

export type DistributeFn = (args: {
  recipientUserId: string;
  recipientDeviceId: string;
  plaintext: string;
}) => Promise<void>;

export type ListMemberDevicesFn = (
  userId: string,
) => Promise<{ deviceId: string }[]>;

export type GroupSenderKeyServiceDeps = {
  store: ISenderKeyStore;
  groupStore: IGroupStore;
  groupsApi: GroupsApi;
  localUserId: string;
  localDeviceId: string;
  distribute: DistributeFn;
  listMemberDevices: ListMemberDevicesFn;
  clock?: Clock;
  messageStore?: IMessageStore;
  resolveUsername?: (userId: string) => Promise<string | null>;
};

/**
 * Owns sender-key create/rotate/distribute + group encrypt/decrypt.
 * Distribution uses existing 1:1 Signal sessions via {@link distribute}.
 */
export class GroupSenderKeyService {
  private readonly clock: Clock;
  private deps: GroupSenderKeyServiceDeps;

  constructor(deps: GroupSenderKeyServiceDeps) {
    this.deps = deps;
    this.clock = deps.clock ?? systemClock;
  }

  /** Update local identity after login/device link. */
  setLocalIdentity(userId: string, deviceId: string): void {
    this.deps = { ...this.deps, localUserId: userId, localDeviceId: deviceId };
  }

  async ensureOwnSendingKey(groupId: string): Promise<SenderKeyState> {
    const existing = await this.deps.store.getOwn(
      groupId,
      this.deps.localUserId,
      this.deps.localDeviceId,
    );
    if (existing) {
      return {
        keyId: existing.keyId,
        iteration: existing.iteration,
        chainKey: existing.chainKey,
        macKey: existing.macKey,
      };
    }
    return this.rotateOwnSenderKey(groupId);
  }

  /** Rotate own key (on member remove/leave) and redistribute to current members. */
  async rotateOwnSenderKey(groupId: string): Promise<SenderKeyState> {
    await this.deps.store.deleteOwn(
      groupId,
      this.deps.localUserId,
      this.deps.localDeviceId,
    );
    const state = createSendingSenderKeyState();
    const now = this.clock();
    await this.deps.store.upsert({
      groupId,
      senderUserId: this.deps.localUserId,
      senderDeviceId: this.deps.localDeviceId,
      keyId: state.keyId,
      iteration: state.iteration,
      chainKey: state.chainKey,
      macKey: state.macKey,
      isOwn: true,
      updatedAt: now,
    });
    await this.distributeOwnKey(groupId, state);
    return state;
  }

  async distributeOwnKey(
    groupId: string,
    state?: SenderKeyState,
  ): Promise<void> {
    const own = state ?? (await this.ensureOwnSendingKey(groupId));
    const dist = serializeDistribution(
      toDistribution(
        groupId,
        this.deps.localUserId,
        this.deps.localDeviceId,
        own,
      ),
    );
    const members = await this.deps.groupStore.listMembers(groupId, true);
    for (const m of members) {
      const devices = await this.deps.listMemberDevices(m.userId);
      for (const d of devices) {
        if (
          m.userId === this.deps.localUserId &&
          d.deviceId === this.deps.localDeviceId
        ) {
          continue;
        }
        await this.deps.distribute({
          recipientUserId: m.userId,
          recipientDeviceId: d.deviceId,
          plaintext: dist,
        });
      }
    }
  }

  /** Share current own key to one device (catch-up / request response). */
  async shareOwnKeyWithDevice(
    groupId: string,
    recipientUserId: string,
    recipientDeviceId: string,
  ): Promise<void> {
    if (
      recipientUserId === this.deps.localUserId &&
      recipientDeviceId === this.deps.localDeviceId
    ) {
      return;
    }
    const own = await this.ensureOwnSendingKey(groupId);
    const dist = serializeDistribution(
      toDistribution(
        groupId,
        this.deps.localUserId,
        this.deps.localDeviceId,
        own,
      ),
    );
    await this.deps.distribute({
      recipientUserId,
      recipientDeviceId,
      plaintext: dist,
    });
  }

  async requestSenderKeyFrom(
    groupId: string,
    senderUserId: string,
    senderDeviceId: string,
  ): Promise<void> {
    const plaintext = serializeSenderKeyRequest({
      groupId,
      requesterUserId: this.deps.localUserId,
      requesterDeviceId: this.deps.localDeviceId,
    });
    await this.deps.distribute({
      recipientUserId: senderUserId,
      recipientDeviceId: senderDeviceId,
      plaintext,
    });
  }

  /**
   * Handle control plaintext from a 1:1 Signal session.
   * Returns true if consumed (SKD or SK request).
   */
  async ingestControlPlaintext(plaintext: string): Promise<boolean> {
    if (await this.ingestDistribution(plaintext)) return true;
    const req = parseSenderKeyRequest(plaintext);
    if (!req) return false;
    // Only respond if we are still an active member.
    const members = await this.deps.groupStore.listMembers(req.groupId, true);
    if (!members.some((m) => m.userId === this.deps.localUserId)) {
      return true; // consumed but ignored
    }
    await this.shareOwnKeyWithDevice(
      req.groupId,
      req.requesterUserId,
      req.requesterDeviceId,
    );
    return true;
  }

  async ingestDistribution(plaintext: string): Promise<boolean> {
    const d = parseDistribution(plaintext);
    if (!d) return false;
    const state = stateFromDistribution(d);
    await this.deps.store.upsert({
      groupId: d.groupId,
      senderUserId: d.senderUserId,
      senderDeviceId: d.senderDeviceId,
      keyId: state.keyId,
      iteration: state.iteration,
      chainKey: state.chainKey,
      macKey: state.macKey,
      isOwn: false,
      updatedAt: this.clock(),
    });
    return true;
  }

  /**
   * Encrypt arbitrary plaintext + fan-out via Groups API (Sender Keys).
   */
  async encryptAndSendGroupPlaintext(
    groupId: string,
    plaintext: string,
  ): Promise<{ envelopeIds: string[] }> {
    const state = await this.ensureOwnSendingKey(groupId);
    const { wire, nextState } = await encryptSenderKey(
      state,
      textToBytes(plaintext),
    );
    await this.deps.store.upsert({
      groupId,
      senderUserId: this.deps.localUserId,
      senderDeviceId: this.deps.localDeviceId,
      keyId: nextState.keyId,
      iteration: nextState.iteration,
      chainKey: nextState.chainKey,
      macKey: nextState.macKey,
      isOwn: true,
      updatedAt: this.clock(),
    });
    const wireJson = serializeSenderKeyCiphertext(wire);
    const result = await this.deps.groupsApi.send(groupId, {
      messageType: SENDER_KEY_MESSAGE_TYPE,
      ciphertextBase64: bytesToBase64(textToBytes(wireJson)),
    });
    return { envelopeIds: result.envelopeIds };
  }

  async encryptAndSendGroupText(
    groupId: string,
    text: string,
  ): Promise<{ envelopeIds: string[] }> {
    // Raw text for backwards-compatible decrypt helpers; structured
    // payloads (media/reaction/control) use encryptAndSendGroupPlaintext.
    return this.encryptAndSendGroupPlaintext(groupId, text);
  }

  /** Actor-authenticated membership/control event (E2EE via Sender Keys). */
  async sendGroupControl(
    groupId: string,
    event: GroupControlEvent,
    opts?: { subjectUserId?: string; name?: string },
  ): Promise<{ envelopeIds: string[] }> {
    return this.encryptAndSendGroupPlaintext(
      groupId,
      serializeGroupControlPayload({
        event,
        actorUserId: this.deps.localUserId,
        subjectUserId: opts?.subjectUserId,
        name: opts?.name,
      }),
    );
  }

  /**
   * Decrypt group envelope ciphertext (base64 of UTF-8 JSON wire).
   * `missing_key` → buffer and request distribution.
   */
  async tryDecryptGroupCiphertext(args: {
    groupId: string;
    senderUserId: string;
    senderDeviceId: string;
    ciphertextBase64: string;
  }): Promise<{ text: string } | "missing_key" | "failed"> {
    let wireJson: string;
    try {
      wireJson = bytesToText(base64ToBytes(args.ciphertextBase64));
    } catch {
      return "failed";
    }
    const wire = parseSenderKeyCiphertext(wireJson);
    if (!wire) return "failed";

    const stored = await this.deps.store.get(
      args.groupId,
      args.senderUserId,
      args.senderDeviceId,
      wire.keyId,
    );
    if (!stored) {
      // Best-effort request; caller leaves envelope on server for retry.
      void this.requestSenderKeyFrom(
        args.groupId,
        args.senderUserId,
        args.senderDeviceId,
      ).catch(() => undefined);
      return "missing_key";
    }

    try {
      const { plaintext, nextState } = await decryptSenderKey(
        {
          keyId: stored.keyId,
          iteration: stored.iteration,
          chainKey: stored.chainKey,
          macKey: stored.macKey,
        },
        wire,
      );
      await this.deps.store.upsert({
        ...stored,
        iteration: nextState.iteration,
        chainKey: nextState.chainKey,
        updatedAt: this.clock(),
      });
      return { text: bytesToText(plaintext) };
    } catch (e) {
      if (e instanceof SenderKeyError && e.code === "UNKNOWN_KEY_ID") {
        void this.requestSenderKeyFrom(
          args.groupId,
          args.senderUserId,
          args.senderDeviceId,
        ).catch(() => undefined);
        return "missing_key";
      }
      return "failed";
    }
  }

  /**
   * Handle SignalR GroupMembershipChanged.
   * Remaining members rotate; system message inserted; new members request catch-up.
   */
  async handleMembershipChanged(payload: {
    groupId: string;
    change: string;
    actorUserId: string;
    subjectUserId?: string | null;
    at?: string | number;
  }): Promise<void> {
    const groupId = payload.groupId;
    const change = payload.change as GroupSystemEvent;
    const at =
      typeof payload.at === "number"
        ? payload.at
        : payload.at
          ? Date.parse(payload.at) || this.clock()
          : this.clock();

    if (change === "removed" || change === "left") {
      const subject = payload.subjectUserId ?? null;
      if (subject) {
        await this.deps.groupStore.markMemberLeft(groupId, subject, at);
      }
      // Remaining active members (including us if still in) rotate.
      const stillIn = (await this.deps.groupStore.listMembers(groupId, true)).some(
        (m) => m.userId === this.deps.localUserId,
      );
      if (stillIn) {
        await this.rotateOwnSenderKey(groupId);
      }
    } else if (change === "added") {
      const subject = payload.subjectUserId;
      if (subject) {
        const username =
          (await this.deps.resolveUsername?.(subject)) ?? subject.slice(0, 8);
        await this.deps.groupStore.upsertMember({
          groupId,
          userId: subject,
          username,
          role: "member",
          joinedAt: at,
          leftAt: null,
        });
      }
      const stillIn = (await this.deps.groupStore.listMembers(groupId, true)).some(
        (m) => m.userId === this.deps.localUserId,
      );
      if (stillIn) {
        // Share our current key with the new member's devices.
        if (subject && subject !== this.deps.localUserId) {
          const devices = await this.deps.listMemberDevices(subject);
          for (const d of devices) {
            await this.shareOwnKeyWithDevice(groupId, subject, d.deviceId);
          }
        }
        // If we were the one added (or new linked device joining), request keys.
        if (subject === this.deps.localUserId) {
          await this.requestCatchUp(groupId);
        }
      }
    }

    // System messages are E2EE group_control payloads from the actor, not SignalR plaintext.
  }

  /** New linked device: ensure own key exists and request others' keys. */
  async catchUpForLinkedDevice(groupId: string): Promise<void> {
    await this.ensureOwnSendingKey(groupId);
    await this.distributeOwnKey(groupId);
    await this.requestCatchUp(groupId);
  }

  private async requestCatchUp(groupId: string): Promise<void> {
    const members = await this.deps.groupStore.listMembers(groupId, true);
    for (const m of members) {
      if (m.userId === this.deps.localUserId) continue;
      const devices = await this.deps.listMemberDevices(m.userId);
      for (const d of devices) {
        await this.requestSenderKeyFrom(groupId, m.userId, d.deviceId);
      }
    }
  }

  /**
   * Apply a verified group_control event as a local system row.
   * Caller must authenticate the actor (admin / self-leave).
   */
  async applyVerifiedGroupControl(args: {
    groupId: string;
    event: GroupControlEvent;
    actorUserId: string;
    subjectUserId?: string | null;
    name?: string | null;
    serverEnvelopeId?: string;
  }): Promise<void> {
    if (!this.deps.messageStore) return;
    if (args.event === "renamed") {
      const actor =
        (await this.deps.resolveUsername?.(args.actorUserId)) ??
        args.actorUserId.slice(0, 8);
      const text = args.name
        ? `${actor} renamed the group to "${args.name}"`
        : `${actor} renamed the group`;
      await this.insertSystemRow(args.groupId, text, args.serverEnvelopeId);
      return;
    }
    const change = args.event as GroupSystemEvent;
    const actor =
      (await this.deps.resolveUsername?.(args.actorUserId)) ??
      args.actorUserId.slice(0, 8);
    const subject = args.subjectUserId
      ? ((await this.deps.resolveUsername?.(args.subjectUserId)) ??
        args.subjectUserId.slice(0, 8))
      : null;
    const text = formatGroupSystemMessage(change, actor, subject);
    await this.insertSystemRow(args.groupId, text, args.serverEnvelopeId);
  }

  private async insertSystemRow(
    groupId: string,
    text: string,
    serverEnvelopeId?: string,
  ): Promise<void> {
    if (!this.deps.messageStore) return;
    if (serverEnvelopeId) {
      const existing = await this.deps.messageStore.getByServerEnvelopeId(
        serverEnvelopeId,
      );
      if (existing) return;
    }
    const now = this.clock();
    const row: LocalMessage = {
      id: randomUUID(),
      clientId: randomUUID(),
      conversationId: groupId,
      direction: "incoming",
      kind: "text",
      plaintext: text,
      status: "sent",
      senderDeviceId: "system",
      serverEnvelopeId,
      createdAt: now,
    };
    await this.deps.messageStore.insert(row);
    await this.deps.groupStore.touchPreview(groupId, text, now);
  }
}
