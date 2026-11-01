import type { MessagesApi } from "@/lib/api/messages-api";
import type { MessageEnvelopeDto } from "@/lib/api/api-types";
import type { SessionResetApi } from "@/lib/api/session-reset-api";
import { base64ToBytes } from "@/lib/crypto/encoding";
import { randomUUID } from "@/lib/crypto/random-id";
import type { SignalService } from "@/lib/crypto/signal-service";
import type { IConversationStore } from "@/lib/db/conversation-store";
import type { IEnvelopeAttemptStore } from "@/lib/db/envelope-attempt-store";
import type {
  IEnvelopeQuarantineStore,
  QuarantinedEnvelope,
} from "@/lib/db/envelope-quarantine-store";
import type { IMessageStore } from "@/lib/db/message-store";
import type { IReactionStore } from "@/lib/db/reaction-store";
import type { Conversation, LocalMessage } from "@/lib/db/types";
import type { MediaTransferService } from "@/lib/media/media-transfer";
import {
  parseSignalPlaintext,
  type ReactionOp,
} from "@/lib/protocol/payload";
import { useMediaStore } from "@/stores/media-store";

import {
  classifyDecryptError,
  shouldRequestSessionReset,
} from "./classify-decrypt-error";
import {
  MESSAGE_REQUEST_TTL_MS,
  SESSION_RESET_CLIENT_COOLDOWN_MS,
  UNDISPLAYABLE_MESSAGE_PLACEHOLDER,
  type Clock,
  systemClock,
} from "./constants";
import { isInvalidStructuredPayload } from "./structured-payload";

export type InboundLogFn = (event: {
  envelopeId: string;
  errorClass: string;
  errorName: string;
}) => void;

export type SessionResetCooldown = {
  canSend(peerDeviceId: string, now: number, cooldownMs: number): boolean;
  markSent(peerDeviceId: string, now: number): void;
};

export type InboundProcessorDeps = {
  messagesApi: MessagesApi;
  signalService: SignalService;
  messageStore: IMessageStore;
  conversationStore: IConversationStore;
  reactionStore: IReactionStore;
  quarantineStore: IEnvelopeQuarantineStore;
  attemptStore: IEnvelopeAttemptStore;
  sessionResetApi: SessionResetApi;
  sessionResetCooldown: SessionResetCooldown;
  mediaTransfer: MediaTransferService | null;
  /** Returns whether the app lock / DB is available for crypto + SQL. */
  isDbReady: () => boolean;
  clock?: Clock;
  logFailure?: InboundLogFn;
  onReactionApplied?: (conversationId: string) => void;
  /** Optional: resolve username for message requests when missing. */
  resolveUsername?: (userId: string) => Promise<string | null>;
};

export class InboundEnvelopeProcessor {
  private readonly clock: Clock;
  private deps: InboundProcessorDeps;

  constructor(deps: InboundProcessorDeps) {
    this.deps = deps;
    this.clock = deps.clock ?? systemClock;
  }

  setMediaTransfer(mediaTransfer: MediaTransferService | null): void {
    this.deps.mediaTransfer = mediaTransfer;
  }

  /** Expire stale message requests; wipe ciphertext. */
  async expireStaleMessageRequests(): Promise<void> {
    await this.deps.quarantineStore.expireBefore(this.clock());
  }

  async processEnvelope(env: MessageEnvelopeDto): Promise<void> {
    // Per-envelope isolation — never throw out to abort the batch.
    try {
      await this.processEnvelopeInner(env);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (__DEV__) {
        console.warn("[InboundEnvelopeProcessor] envelope failed", env.id, msg);
      }
      this.deps.logFailure?.({
        envelopeId: env.id,
        errorClass: "unexpected",
        errorName: e instanceof Error ? e.name : "Error",
      });
    }
  }

  async acceptMessageRequest(quarantineId: string): Promise<void> {
    const all = await this.deps.quarantineStore.listPendingMessageRequests();
    const row = all.find((r) => r.id === quarantineId);
    if (!row) throw new Error("Message request not found");
    if (!row.senderUserId) throw new Error("Message request missing sender user");

    let username = row.senderUsername ?? null;
    if (!username && this.deps.resolveUsername) {
      username = await this.deps.resolveUsername(row.senderUserId);
    }
    username = username ?? "unknown";

    const existing = await this.deps.conversationStore.getByPeer(row.senderUserId);
    const conversation: Conversation =
      existing ??
      ({
        id: randomUUID(),
        peerUserId: row.senderUserId,
        peerUsername: username,
        peerDeviceId: row.senderDeviceId,
        lastMessagePreview: "",
        lastMessageAt: 0,
        unreadCount: 0,
      } satisfies Conversation);

    if (!existing) {
      await this.deps.conversationStore.upsert(conversation);
    }

    const now = this.clock();
    await this.deps.quarantineStore.updateStatus(row.id, "accepted", now);

    // Re-process locally (already acked on server).
    await this.decryptQuarantined(row, conversation);
  }

  async rejectMessageRequest(quarantineId: string): Promise<void> {
    const all = await this.deps.quarantineStore.listPendingMessageRequests();
    const row = all.find((r) => r.id === quarantineId);
    if (!row) return;
    await this.deps.quarantineStore.updateStatus(
      row.id,
      "rejected",
      this.clock(),
    );
  }

  listMessageRequests(): Promise<QuarantinedEnvelope[]> {
    return this.deps.quarantineStore.listPendingMessageRequests();
  }

  /** After user accepts a new identity key, retry quarantined envelopes for that peer. */
  async retryIdentityQuarantine(peerUserId: string): Promise<void> {
    const rows =
      await this.deps.quarantineStore.listPendingIdentityForPeer(peerUserId);
    for (const row of rows) {
      try {
        const conversation = row.conversationId
          ? await this.deps.conversationStore.getById(row.conversationId)
          : await this.deps.conversationStore.getByPeer(peerUserId);
        if (!conversation) {
          continue;
        }
        await this.decryptQuarantined(row, conversation);
      } catch (e) {
        if (__DEV__) {
          console.warn(
            "[InboundEnvelopeProcessor] identity quarantine retry failed",
            row.serverEnvelopeId,
            e instanceof Error ? e.message : e,
          );
        }
      }
    }
  }

  private async processEnvelopeInner(env: MessageEnvelopeDto): Promise<void> {
    if (!this.deps.isDbReady()) {
      // Transient: leave on server, retry after unlock.
      return;
    }

    const conversation = await this.findConversationForSender(env.senderDeviceId);
    if (!conversation) {
      await this.quarantineMessageRequest(env);
      await this.deps.messagesApi.ack(env.id);
      return;
    }

    let ciphertext: Uint8Array;
    try {
      ciphertext = base64ToBytes(env.ciphertextBase64);
    } catch (e) {
      await this.handlePermanentFailure(env, conversation, e, "corrupt_base64");
      return;
    }

    if (env.messageType !== 2 && env.messageType !== 3) {
      await this.handlePermanentFailure(
        env,
        conversation,
        new Error("Invalid message type"),
        "bad_message_type",
      );
      return;
    }

    let plaintext: string;
    try {
      plaintext = await this.deps.signalService.decryptIncoming(
        conversation.peerUserId,
        env.messageType,
        ciphertext,
      );
    } catch (e) {
      await this.handleDecryptFailure(env, conversation, ciphertext, e);
      return;
    }

    await this.deps.attemptStore.clear(env.id);
    await this.dispatchPlaintext(env, conversation, plaintext);
  }

  private async handleDecryptFailure(
    env: MessageEnvelopeDto,
    conversation: Conversation,
    ciphertext: Uint8Array,
    error: unknown,
  ): Promise<void> {
    const trust = await this.deps.signalService.getIdentityTrust(
      conversation.peerUserId,
    );
    let kind = classifyDecryptError(error, { keyChanged: trust.keyChanged });
    const errorName = error instanceof Error ? error.name : "Error";
    const now = this.clock();

    if (kind === "needs_user") {
      await this.deps.quarantineStore.upsertPending({
        serverEnvelopeId: env.id,
        senderDeviceId: env.senderDeviceId,
        senderUserId: env.senderUserId || conversation.peerUserId,
        conversationId: conversation.id,
        kind: "identity_key",
        messageType: env.messageType,
        ciphertext,
        errorClass: "needs_user",
        errorName,
        createdAt: now,
      });
      this.deps.logFailure?.({
        envelopeId: env.id,
        errorClass: "needs_user",
        errorName,
      });
      await this.deps.messagesApi.ack(env.id);
      return;
    }

    const attempt = await this.deps.attemptStore.recordAttempt(
      env.id,
      kind,
      errorName,
      now,
    );

    if (kind === "transient" && this.deps.attemptStore.isExhausted(attempt, now)) {
      kind = "permanent";
    }

    if (kind === "transient") {
      this.deps.logFailure?.({
        envelopeId: env.id,
        errorClass: "transient",
        errorName,
      });
      // No ack — retry on next pull (caller may apply backoff).
      return;
    }

    // permanent
    if (shouldRequestSessionReset(error)) {
      await this.maybeSendSessionReset(conversation.peerDeviceId, now);
    }
    await this.handlePermanentFailure(env, conversation, error, errorName);
  }

  private async handlePermanentFailure(
    env: MessageEnvelopeDto,
    conversation: Conversation,
    error: unknown,
    errorName: string,
  ): Promise<void> {
    const name = error instanceof Error ? error.name : errorName;
    this.deps.logFailure?.({
      envelopeId: env.id,
      errorClass: "permanent",
      errorName: name,
    });
    await this.insertPlaceholder(conversation, env);
    await this.deps.attemptStore.clear(env.id);
    await this.deps.messagesApi.ack(env.id);
  }

  private async quarantineMessageRequest(
    env: MessageEnvelopeDto,
  ): Promise<void> {
    const now = this.clock();
    let username: string | undefined;
    if (env.senderUserId && this.deps.resolveUsername) {
      username =
        (await this.deps.resolveUsername(env.senderUserId)) ?? undefined;
    }
    let ciphertext: Uint8Array;
    try {
      ciphertext = base64ToBytes(env.ciphertextBase64);
    } catch {
      ciphertext = new Uint8Array(0);
    }
    await this.deps.quarantineStore.upsertPending({
      serverEnvelopeId: env.id,
      senderDeviceId: env.senderDeviceId,
      senderUserId: env.senderUserId || undefined,
      senderUsername: username,
      kind: "message_request",
      messageType: env.messageType,
      ciphertext,
      errorClass: "message_request",
      errorName: "unknown_sender",
      createdAt: now,
      expiresAt: now + MESSAGE_REQUEST_TTL_MS,
    });
    this.deps.logFailure?.({
      envelopeId: env.id,
      errorClass: "message_request",
      errorName: "unknown_sender",
    });
  }

  private async decryptQuarantined(
    row: QuarantinedEnvelope,
    conversation: Conversation,
  ): Promise<void> {
    if (row.ciphertext.length === 0) {
      await this.deps.quarantineStore.updateStatus(
        row.id,
        "processed",
        this.clock(),
      );
      return;
    }
    if (row.messageType !== 2 && row.messageType !== 3) {
      await this.insertPlaceholder(conversation, {
        id: row.serverEnvelopeId,
        senderDeviceId: row.senderDeviceId,
        senderUserId: row.senderUserId ?? conversation.peerUserId,
        messageType: row.messageType,
        createdAt: new Date(row.createdAt).toISOString(),
      });
      await this.deps.quarantineStore.updateStatus(
        row.id,
        "processed",
        this.clock(),
      );
      return;
    }
    try {
      const plaintext = await this.deps.signalService.decryptIncoming(
        conversation.peerUserId,
        row.messageType,
        row.ciphertext,
      );
      await this.dispatchPlaintext(
        {
          id: row.serverEnvelopeId,
          senderDeviceId: row.senderDeviceId,
          senderUserId: row.senderUserId ?? conversation.peerUserId,
          messageType: row.messageType,
          ciphertextBase64: "",
          createdAt: new Date(row.createdAt).toISOString(),
        },
        conversation,
        plaintext,
        { skipAck: true },
      );
      await this.deps.quarantineStore.updateStatus(
        row.id,
        "processed",
        this.clock(),
      );
    } catch (e) {
      const trust = await this.deps.signalService.getIdentityTrust(
        conversation.peerUserId,
      );
      const kind = classifyDecryptError(e, { keyChanged: trust.keyChanged });
      if (kind === "needs_user") {
        // Keep quarantined until user accepts again.
        return;
      }
      if (kind === "transient") {
        return;
      }
      await this.insertPlaceholder(conversation, {
        id: row.serverEnvelopeId,
        senderDeviceId: row.senderDeviceId,
        senderUserId: row.senderUserId ?? conversation.peerUserId,
        messageType: row.messageType,
        createdAt: new Date(row.createdAt).toISOString(),
      });
      await this.deps.quarantineStore.updateStatus(
        row.id,
        "processed",
        this.clock(),
      );
    }
  }

  private async dispatchPlaintext(
    env: MessageEnvelopeDto,
    conversation: Conversation,
    plaintext: string,
    opts?: { skipAck?: boolean },
  ): Promise<void> {
    const parsed = parseSignalPlaintext(plaintext);

    if (isInvalidStructuredPayload(plaintext, parsed)) {
      await this.insertPlaceholder(conversation, env);
      if (!opts?.skipAck) await this.deps.messagesApi.ack(env.id);
      return;
    }

    if (parsed.kind === "media") {
      if (!this.deps.mediaTransfer) {
        // Transient — leave on server if not yet acked.
        if (!opts?.skipAck) return;
        throw new Error("Media transfer is not initialized");
      }
      await this.deps.mediaTransfer.ingestIncomingMedia({
        conversation,
        payload: parsed.payload,
        senderDeviceId: env.senderDeviceId,
        serverEnvelopeId: env.id,
        createdAt: Date.parse(env.createdAt) || this.clock(),
        messageType: env.messageType as 2 | 3,
      });
      if (!opts?.skipAck) await this.deps.messagesApi.ack(env.id);
      if (useMediaStore.getState().autoDownloadPolicy !== "never") {
        void this.deps.mediaTransfer.downloadAttachment(
          parsed.payload.attachmentId,
        );
      }
      return;
    }

    if (parsed.kind === "reaction") {
      await this.applyIncomingReaction(
        conversation,
        conversation.peerUserId,
        parsed.payload.op,
        parsed.payload.emoji,
        parsed.payload.targetServerEnvelopeId,
      );
      if (!opts?.skipAck) await this.deps.messagesApi.ack(env.id);
      return;
    }

    const text = parsed.kind === "text" ? parsed.payload.text : parsed.text;
    const msg: LocalMessage = {
      id: randomUUID(),
      clientId: randomUUID(),
      conversationId: conversation.id,
      direction: "incoming",
      kind: "text",
      plaintext: text,
      messageType: env.messageType as 2 | 3,
      status: "delivered",
      senderDeviceId: env.senderDeviceId,
      serverEnvelopeId: env.id,
      createdAt: Date.parse(env.createdAt) || this.clock(),
    };
    await this.deps.messageStore.insert(msg);
    await this.deps.conversationStore.upsert({
      ...conversation,
      lastMessagePreview: text.slice(0, 120),
      lastMessageAt: msg.createdAt,
      unreadCount: conversation.unreadCount + 1,
    });
    if (!opts?.skipAck) await this.deps.messagesApi.ack(env.id);
  }

  private async insertPlaceholder(
    conversation: Conversation,
    env: Pick<
      MessageEnvelopeDto,
      "id" | "senderDeviceId" | "messageType" | "createdAt"
    > & { senderUserId?: string },
  ): Promise<void> {
    const existing = await this.deps.messageStore.getByServerEnvelopeId(env.id);
    if (existing) return;
    const createdAt = Date.parse(env.createdAt) || this.clock();
    const msg: LocalMessage = {
      id: randomUUID(),
      clientId: randomUUID(),
      conversationId: conversation.id,
      direction: "incoming",
      kind: "text",
      plaintext: UNDISPLAYABLE_MESSAGE_PLACEHOLDER,
      messageType:
        env.messageType === 2 || env.messageType === 3
          ? env.messageType
          : undefined,
      status: "delivered",
      senderDeviceId: env.senderDeviceId,
      serverEnvelopeId: env.id,
      createdAt,
    };
    await this.deps.messageStore.insert(msg);
    await this.deps.conversationStore.upsert({
      ...conversation,
      lastMessagePreview: UNDISPLAYABLE_MESSAGE_PLACEHOLDER.slice(0, 120),
      lastMessageAt: createdAt,
      unreadCount: conversation.unreadCount + 1,
    });
  }

  private async applyIncomingReaction(
    conversation: Conversation,
    senderUserId: string,
    op: ReactionOp,
    emoji: string,
    targetServerEnvelopeId: string,
  ): Promise<void> {
    const target = await this.deps.messageStore.getByServerEnvelopeId(
      targetServerEnvelopeId,
    );
    if (!target) {
      if (__DEV__) {
        console.warn(
          "[InboundEnvelopeProcessor] reaction for unknown envelope",
          targetServerEnvelopeId,
        );
      }
      return;
    }
    await this.deps.reactionStore.apply(target.id, emoji, senderUserId, op);
    this.deps.onReactionApplied?.(conversation.id);
  }

  private async findConversationForSender(
    senderDeviceId: string,
  ): Promise<Conversation | null> {
    const all = await this.deps.conversationStore.listAll();
    return all.find((c) => c.peerDeviceId === senderDeviceId) ?? null;
  }

  private async maybeSendSessionReset(
    peerDeviceId: string,
    now: number,
  ): Promise<void> {
    if (
      !this.deps.sessionResetCooldown.canSend(
        peerDeviceId,
        now,
        SESSION_RESET_CLIENT_COOLDOWN_MS,
      )
    ) {
      return;
    }
    try {
      await this.deps.sessionResetApi.request(peerDeviceId);
      this.deps.sessionResetCooldown.markSent(peerDeviceId, now);
    } catch (e) {
      if (__DEV__) {
        console.warn(
          "[InboundEnvelopeProcessor] session reset request failed",
          e instanceof Error ? e.message : e,
        );
      }
    }
  }
}
