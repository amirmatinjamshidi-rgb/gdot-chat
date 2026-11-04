import type { MessagesApi } from "@/lib/api/messages-api";
import type { SessionResetApi } from "@/lib/api/session-reset-api";
import type { SignalRClient } from "@/lib/api/signalr-client";
import {
  ENABLE_SIGNALR,
  SYNC_POLL_INTERVAL_MS,
  SYNC_PULL_DEBOUNCE_MS,
} from "@/lib/config";
import { decideSyncTransport } from "@/lib/session/sync-transport-policy";
import type { SignalService } from "@/lib/crypto/signal-service";
import { randomUUID } from "@/lib/crypto/random-id";
import {
  protocolAddressId,
  sessionStoreKey,
} from "@/lib/crypto/signal-address";
import type { IConversationStore } from "@/lib/db/conversation-store";
import { MemorySessionResetCooldownStore } from "@/lib/db/envelope-attempt-store";
import type { IEnvelopeAttemptStore } from "@/lib/db/envelope-attempt-store";
import type { IEnvelopeQuarantineStore } from "@/lib/db/envelope-quarantine-store";
import type { IIdentityStore } from "@/lib/db/identity-store";
import type { IMessageStore } from "@/lib/db/message-store";
import type { IOutboxStore, OutboxEntry } from "@/lib/db/outbox-store";
import type { IPendingReceiptStore } from "@/lib/db/pending-receipt-store";
import { ReceiptRetryService } from "@/lib/session/receipt-retry";
import {
  SendRetryService,
  type IPendingOutgoingSendStore,
} from "@/lib/session/send-retry";
import type { IMediaBlobCache } from "@/lib/media/media-blob-cache";
import type { IReactionStore } from "@/lib/db/reaction-store";
import type { ISessionStore } from "@/lib/db/session-store";
import type { Conversation, LocalMessage } from "@/lib/db/types";
import type { MediaTransferService } from "@/lib/media/media-transfer";
import {
  parseSignalPlaintext,
  serializeMediaPayload,
  serializeReactionPayload,
  serializeReceiptPayload,
  serializeTextPayload,
  type MediaPayload,
  type ReactionOp,
} from "@/lib/protocol/payload";
import { assertMessageTextWithinLimit } from "@/lib/protocol/message-limits";
import { isOfflineToken, type AuthStore } from "@/lib/session/auth-store";
import { appLockStore } from "@/lib/session/app-lock-store";
import { isQuietDbCancel } from "@/lib/db/db-errors";
import { InboundEnvelopeProcessor } from "@/lib/session/inbound/inbound-envelope-processor";
import type { GroupSenderKeyService } from "@/lib/session/group-sender-key-service";
import type { IGroupStore } from "@/lib/db/group-store";
import type { IGroupReceiptStore } from "@/lib/db/group-receipt-store";
import { systemClock, type Clock } from "@/lib/session/inbound/constants";
import {
  OUTBOX_MAX_PER_CONVERSATION,
  OUTBOX_MAX_RESENDS,
  OUTBOX_TTL_MS,
} from "@/lib/session/outbox-constants";

export type SyncErrorHandler = (message: string) => void;
export type ReactionAppliedHandler = (conversationId: string) => void;

export type FanOutDevice = { userId: string; deviceId: string };

export type SyncServiceDeviceDirectory = {
  listPeerDevices: (userId: string) => Promise<{ deviceId: string }[]>;
  listOwnDevices: () => Promise<{ deviceId: string }[]>;
};

export type SyncServiceInboundDeps = {
  quarantineStore: IEnvelopeQuarantineStore;
  attemptStore: IEnvelopeAttemptStore;
  sessionResetApi: SessionResetApi;
  sessionStore: ISessionStore;
  outboxStore: IOutboxStore;
  /** Durable E2EE delivery-receipt retry queue (SQLCipher). */
  pendingReceiptStore?: IPendingReceiptStore;
  /** Durable outgoing text send retry queue. */
  pendingOutgoingSendStore?: IPendingOutgoingSendStore;
  clock?: Clock;
  resolveUsername?: (userId: string) => Promise<string | null>;
  /** When set, encryptAndPost fans out to all peer + own other devices. */
  deviceDirectory?: SyncServiceDeviceDirectory;
  mediaBlobCache?: IMediaBlobCache;
  /** Re-upload encrypted blob after session reset when server attachment is gone. */
  reuploadMediaBlob?: (params: {
    conversation: Conversation;
    clientMessageId: string;
    descriptor: MediaPayload;
    ciphertext: Uint8Array;
  }) => Promise<MediaPayload>;
  /** Check whether a server attachment still exists (for media resend). */
  attachmentExists?: (attachmentId: string) => Promise<boolean>;
  decryptGroupCiphertext?: (args: {
    groupId: string;
    senderUserId: string;
    senderDeviceId: string;
    ciphertextBase64: string;
  }) => Promise<{ text: string } | "missing_key" | "failed">;
  ingestSenderKeyDistribution?: (plaintext: string) => Promise<boolean>;
  groupSenderKeyService?: GroupSenderKeyService | null;
  groupStore?: IGroupStore | null;
  groupReceiptStore?: IGroupReceiptStore | null;
};

export class SyncService {
  readonly instanceId = randomUUID();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private onError: SyncErrorHandler | null = null;
  private onReactionApplied: ReactionAppliedHandler | null = null;
  private pullChain: Promise<void> = Promise.resolve();
  private sendChain: Promise<void> = Promise.resolve();
  private startInFlight: Promise<void> | null = null;
  private outboundInFlight = 0;
  private signalRConnected = false;
  private appInForeground = true;
  private pullDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private applyingTransport = false;
  private transientBackoffUntil = 0;
  private readonly inbound: InboundEnvelopeProcessor;
  private readonly sessionStore: ISessionStore;
  private readonly clock: Clock;
  private readonly sessionResetCooldown = new MemorySessionResetCooldownStore();
  private readonly outboxStore: IOutboxStore;
  private readonly receiptRetry: ReceiptRetryService | null;
  private readonly sendRetry: SendRetryService | null;
  private readonly deviceDirectory: SyncServiceDeviceDirectory | null;
  private readonly mediaBlobCache: IMediaBlobCache | null;
  private readonly reuploadMediaBlob:
    | SyncServiceInboundDeps["reuploadMediaBlob"]
    | null;
  private readonly attachmentExists:
    | SyncServiceInboundDeps["attachmentExists"]
    | null;
  private groupSenderKeyService: GroupSenderKeyService | null;
  private readonly groupStore: IGroupStore | null;
  private readonly groupReceiptStore: IGroupReceiptStore | null;

  constructor(
    private readonly messagesApi: MessagesApi,
    private readonly signalr: SignalRClient,
    private readonly signalService: SignalService,
    private readonly messageStore: IMessageStore,
    private readonly conversationStore: IConversationStore,
    private readonly identityStore: IIdentityStore,
    private readonly authStore: AuthStore,
    private readonly reactionStore: IReactionStore,
    private mediaTransfer: MediaTransferService | null = null,
    inboundDeps?: SyncServiceInboundDeps,
  ) {
    if (!inboundDeps) {
      throw new Error("SyncService requires inboundDeps (quarantine/attempt/sessionReset)");
    }
    this.sessionStore = inboundDeps.sessionStore;
    this.outboxStore = inboundDeps.outboxStore;
    this.deviceDirectory = inboundDeps.deviceDirectory ?? null;
    this.mediaBlobCache = inboundDeps.mediaBlobCache ?? null;
    this.reuploadMediaBlob = inboundDeps.reuploadMediaBlob ?? null;
    this.attachmentExists = inboundDeps.attachmentExists ?? null;
    this.groupSenderKeyService = inboundDeps.groupSenderKeyService ?? null;
    this.groupStore = inboundDeps.groupStore ?? null;
    this.groupReceiptStore = inboundDeps.groupReceiptStore ?? null;
    this.clock = inboundDeps.clock ?? systemClock;
    this.receiptRetry = inboundDeps.pendingReceiptStore
      ? new ReceiptRetryService({
          store: inboundDeps.pendingReceiptStore,
          sendEncrypted: (conversation, plaintext) =>
            this.encryptAndPost(conversation, plaintext).then(() => undefined),
          getConversation: (id) => this.conversationStore.getById(id),
          clock: this.clock,
        })
      : null;
    this.sendRetry = inboundDeps.pendingOutgoingSendStore
      ? new SendRetryService({
          store: inboundDeps.pendingOutgoingSendStore,
          getConversation: async (id) => {
            const c = await this.conversationStore.getById(id);
            if (c) return c;
            const g = await this.groupStore?.getGroup(id);
            if (!g) return null;
            return {
              id: g.id,
              peerUserId: g.createdByUserId,
              peerUsername: `group:${g.id.slice(0, 8)}`,
              peerDeviceId: "group",
              lastMessagePreview: g.lastMessagePreview,
              lastMessageAt: g.lastMessageAt,
              unreadCount: g.unreadCount,
            };
          },
          deliver: async ({ conversation, localMessageId, clientMessageId, plaintext }) => {
            if (this.groupStore && (await this.groupStore.getGroup(conversation.id))) {
              if (!this.groupSenderKeyService) throw new Error("Group crypto not ready");
              const result = await this.groupSenderKeyService.encryptAndSendGroupText(
                conversation.id,
                plaintext,
              );
              const envelopeId = result.envelopeIds[0] ?? clientMessageId;
              await this.messageStore.updateServerEnvelopeId(localMessageId, envelopeId);
              await this.outboxStore.upsertPending({
                clientMessageId,
                localMessageId,
                conversationId: conversation.id,
                peerUserId: "group",
                peerDeviceId: "group",
                plaintext,
                payloadKind: "text",
                groupId: conversation.id,
                createdAt: this.clock(),
                expiresAt: this.clock() + OUTBOX_TTL_MS,
              });
              return;
            }
            const result = await this.encryptAndPost(
              conversation,
              serializeTextPayload(plaintext, clientMessageId),
            );
            await this.messageStore.updateServerEnvelopeId(localMessageId, result.envelopeId);
            await this.outboxStore.upsertPending({
              clientMessageId,
              localMessageId,
              conversationId: conversation.id,
              peerUserId: conversation.peerUserId,
              peerDeviceId: conversation.peerDeviceId,
              plaintext,
              payloadKind: "text",
              createdAt: this.clock(),
              expiresAt: this.clock() + OUTBOX_TTL_MS,
            });
          },
          onDelivered: async (localMessageId) => {
            await this.messageStore.updateStatus(localMessageId, "sent");
          },
          onGiveUp: async (localMessageId) => {
            await this.messageStore.updateStatus(localMessageId, "failed");
          },
          clock: this.clock,
        })
      : null;
    this.inbound = new InboundEnvelopeProcessor({
      messagesApi,
      signalService,
      messageStore,
      conversationStore,
      reactionStore,
      quarantineStore: inboundDeps.quarantineStore,
      attemptStore: inboundDeps.attemptStore,
      sessionResetApi: inboundDeps.sessionResetApi,
      sessionResetCooldown: this.sessionResetCooldown,
      mediaTransfer,
      outboxStore: this.outboxStore,
      sendEncrypted: (conversation, plaintext) =>
        this.encryptAndPost(conversation, plaintext).then(() => undefined),
      receiptRetry: this.receiptRetry,
      isDbReady: () => appLockStore.isUnlocked,
      clock: this.clock,
      resolveUsername: inboundDeps.resolveUsername,
      decryptGroupCiphertext: (args) =>
        inboundDeps.decryptGroupCiphertext
          ? inboundDeps.decryptGroupCiphertext(args)
          : this.groupSenderKeyService
            ? this.groupSenderKeyService.tryDecryptGroupCiphertext(args)
            : Promise.resolve("failed" as const),
      ingestSenderKeyDistribution: (plaintext) =>
        inboundDeps.ingestSenderKeyDistribution
          ? inboundDeps.ingestSenderKeyDistribution(plaintext)
          : this.groupSenderKeyService
            ? this.groupSenderKeyService.ingestControlPlaintext(plaintext)
            : Promise.resolve(false),
      groupStore: this.groupStore,
      groupReceiptStore: this.groupReceiptStore,
      applyGroupControl: (args) =>
        this.groupSenderKeyService
          ? this.groupSenderKeyService.applyVerifiedGroupControl(args)
          : Promise.resolve(),
      localUserId: () => this.authStore.getUserId(),
      logFailure: ({ envelopeId, errorClass, errorName }) => {
        if (__DEV__) {
          console.warn(
            "[SyncService] inbound failure",
            envelopeId,
            errorClass,
            errorName,
          );
        }
        if (errorClass === "transient") {
          this.onError?.("Waiting to retry an undecryptable message…");
        } else if (errorClass === "needs_user") {
          this.onError?.(
            "A message is held until you accept this contact's new safety number.",
          );
        } else if (errorClass === "message_request") {
          this.onError?.("New message request received.");
        }
      },
      onReactionApplied: (conversationId) => {
        this.onReactionApplied?.(conversationId);
      },
    });
  }

  setMediaTransfer(mediaTransfer: MediaTransferService): void {
    this.mediaTransfer = mediaTransfer;
    this.inbound.setMediaTransfer(mediaTransfer);
  }

  setGroupSenderKeyService(svc: GroupSenderKeyService | null): void {
    this.groupSenderKeyService = svc;
  }

  setErrorHandler(handler: SyncErrorHandler | null): void {
    this.onError = handler;
  }

  setReactionAppliedHandler(handler: ReactionAppliedHandler | null): void {
    this.onReactionApplied = handler;
  }

  async start(): Promise<void> {
    if (this.started) return;
    if (this.startInFlight) return this.startInFlight;

    this.startInFlight = this.startInner().finally(() => {
      this.startInFlight = null;
    });
    return this.startInFlight;
  }

  private async startInner(): Promise<void> {
    if (this.started) return;
    this.started = true;

    try {
      await this.signalService.replenishLocalPreKeysIfNeeded();
    } catch (e) {
      if (isQuietDbCancel(e) || !this.started) {
        this.started = false;
        return;
      }
      throw e;
    }
    if (!this.started || !appLockStore.isUnlocked) {
      this.started = false;
      return;
    }
    void this.mediaTransfer?.resumeInterrupted().catch((e) => {
      if (!isQuietDbCancel(e) && __DEV__) {
        console.warn(
          "[SyncService] resumeInterrupted failed",
          e instanceof Error ? e.message : e,
        );
      }
    });

    const accessToken = await this.authStore.getAccessToken();
    if (!this.started || !appLockStore.isUnlocked) {
      this.started = false;
      return;
    }
    if (isOfflineToken(accessToken)) {
      await this.authStore.clearSessionExpired();
      this.started = false;
      return;
    }

    this.signalr.setPreKeysLowHandler(() => {
      void this.signalService.replenishLocalPreKeysIfNeeded().catch((e) => {
        if (isQuietDbCancel(e)) return;
        console.warn(
          "[SyncService] PreKeysLow replenish failed",
          e instanceof Error ? e.message : e,
        );
      });
    });
    this.signalr.setGroupMembershipChangedHandler((payload) => {
      void this.groupSenderKeyService
        ?.handleMembershipChanged(payload)
        .catch((e) => {
          if (isQuietDbCancel(e)) return;
          if (__DEV__) {
            console.warn(
              "[SyncService] group membership handler failed",
              e instanceof Error ? e.message : e,
            );
          }
        });
    });
    this.signalr.setSessionResetHandler((fromDeviceId) => {
      void this.handleSessionResetRequested(fromDeviceId);
    });
    void (async () => {
      const local = await this.identityStore.getLocalIdentity();
      if (local && this.groupSenderKeyService) {
        this.groupSenderKeyService.setLocalIdentity(local.userId, local.deviceId);
        const groups = (await this.groupStore?.listGroups()) ?? [];
        for (const g of groups) {
          await this.groupSenderKeyService.catchUpForLinkedDevice(g.id).catch(() => undefined);
        }
      }
    })();
    this.signalr.setEnvelopeHandler(() => {
      this.schedulePullPending();
    });
    this.signalr.setConnectionHandler((connected) => {
      this.signalRConnected = connected;
      if (!this.started || !this.appInForeground) return;
      if (connected) {
        this.stopPolling();
        this.schedulePullPending();
        void this.receiptRetry?.flushDue();
        void this.sendRetry?.flushDue();
      } else {
        // Live push lost (or SignalR disabled path) — poll until reconnect.
        this.startPolling();
      }
    });

    await this.applyTransportPolicy({ syncIfConnected: true });
    // Always try one inbox pull on start (covers poll-only and SignalR race).
    void this.pullPending();
    void this.receiptRetry?.flushDue();
    void this.sendRetry?.flushDue();
  }

  async stop(): Promise<void> {
    this.started = false;
    this.clearPullDebounce();
    this.stopPolling();
    this.signalr.setEnvelopeHandler(null);
    this.signalr.setConnectionHandler(null);
    this.signalr.setPreKeysLowHandler(null);
    this.signalr.setSessionResetHandler(null);
    this.signalr.setGroupMembershipChangedHandler(null);
    this.signalRConnected = false;
    try {
      await this.messagesApi.abortBackground();
    } catch {
      /* ignore */
    }
    await this.signalr.disconnect();
    // Let in-flight start/pull settle (they gate on started / isUnlocked / DB_LOCKED).
    if (this.startInFlight) {
      await this.startInFlight.catch(() => undefined);
    }
    await this.pullChain.catch(() => undefined);
  }

  /** App moved to background: drop live connection and polling. */
  async pauseForBackground(): Promise<void> {
    this.appInForeground = false;
    this.clearPullDebounce();
    await this.applyTransportPolicy();
  }

  /** App foregrounded: reconnect SignalR (or poll) and sync once. */
  async resumeFromForeground(): Promise<void> {
    if (!this.started) {
      this.appInForeground = true;
      return;
    }
    this.appInForeground = true;
    await this.applyTransportPolicy({ syncIfConnected: true });
    void this.pullPending();
    void this.receiptRetry?.flushDue();
        void this.sendRetry?.flushDue();
  }

  private schedulePullPending(): void {
    this.clearPullDebounce();
    this.pullDebounceTimer = setTimeout(() => {
      this.pullDebounceTimer = null;
      void this.pullPending();
    }, SYNC_PULL_DEBOUNCE_MS);
  }

  private clearPullDebounce(): void {
    if (this.pullDebounceTimer) {
      clearTimeout(this.pullDebounceTimer);
      this.pullDebounceTimer = null;
    }
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.onPollTick();
    }, SYNC_POLL_INTERVAL_MS);
  }

  private async onPollTick(): Promise<void> {
    void this.pullPending();
    // Opportunistically heal SignalR after auto-reconnect exhausted.
    if (
      ENABLE_SIGNALR &&
      this.appInForeground &&
      this.started &&
      !this.signalr.isConnected()
    ) {
      try {
        await this.signalr.connect();
      } catch {
        /* poll continues */
      }
    }
  }

  private async applyTransportPolicy(opts?: {
    syncIfConnected?: boolean;
  }): Promise<void> {
    if (this.applyingTransport) return;
    this.applyingTransport = true;
    try {
      if (!this.started) {
        this.stopPolling();
        await this.signalr.disconnect();
        this.signalRConnected = false;
        return;
      }

      const accessToken = await this.authStore.getAccessToken();
      const hasValidToken = Boolean(accessToken) && !isOfflineToken(accessToken);
      const decision = decideSyncTransport({
        enableSignalR: ENABLE_SIGNALR,
        signalRConnected: this.signalr.isConnected(),
        appInForeground: this.appInForeground,
        hasValidToken,
      });

      if (decision.shouldPoll) this.startPolling();
      else this.stopPolling();

      if (decision.shouldConnectSignalR) {
        if (!this.signalr.isConnected()) {
          try {
            await this.signalr.connect();
          } catch {
            if (__DEV__) {
              console.warn("[SyncService] SignalR connect failed");
            }
            this.signalRConnected = false;
            this.startPolling();
          }
        }
        if (opts?.syncIfConnected && this.signalr.isConnected()) {
          this.schedulePullPending();
        }
      } else {
        await this.signalr.disconnect();
        this.signalRConnected = false;
      }
    } finally {
      this.applyingTransport = false;
    }
  }

  async pullPending(): Promise<void> {
    const run = this.pullChain.then(() => this.pullPendingInner());
    this.pullChain = run.catch(() => {});
    return run;
  }

  private async pullPendingInner(): Promise<void> {
    if (this.outboundInFlight > 0) {
      return;
    }
    if (!appLockStore.isUnlocked) {
      return;
    }
    const now = this.clock();
    if (now < this.transientBackoffUntil) {
      return;
    }
    try {
      await this.inbound.expireStaleMessageRequests();
      const envelopes = await this.messagesApi.getPending();
      const localDeviceId = await this.authStore.getDeviceId();
      if (!localDeviceId) return;

      let sawTransient = false;
      for (const env of envelopes) {
        const beforeAttempts = env.id;
        try {
          await this.inbound.processEnvelope(env);
        } catch {
          /* processEnvelope already isolates */
        }
        void beforeAttempts;
      }
      // Soft backoff when failures logged as transient via onError path —
      // attempt store remaining on server implies retry; bump short backoff.
      if (sawTransient) {
        this.transientBackoffUntil = now + 2_000;
      }
    } catch (e) {
      if (isQuietDbCancel(e)) {
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      const abortedForSend =
        this.outboundInFlight > 0 &&
        (msg.includes("Aborted") || msg.includes("abort"));
      if (abortedForSend) {
        return;
      }
      // Network etc. — transient backoff without ack.
      this.transientBackoffUntil = this.clock() + 5_000;
      if (__DEV__) {
        console.warn("[SyncService] pullPending failed", msg);
      }
    } finally {
    }
  }

  listMessageRequests() {
    return this.inbound.listMessageRequests();
  }

  acceptMessageRequest(quarantineId: string) {
    return this.inbound.acceptMessageRequest(quarantineId);
  }

  rejectMessageRequest(quarantineId: string) {
    return this.inbound.rejectMessageRequest(quarantineId);
  }

  retryIdentityQuarantine(peerUserId: string) {
    return this.inbound.retryIdentityQuarantine(peerUserId);
  }

  /** Peer asked us to drop our Signal session so their next send uses a fresh prekey bundle. */
  async handleSessionResetRequested(fromDeviceId: string): Promise<void> {
    const all = await this.conversationStore.listAll();
    const conversation = all.find((c) => c.peerDeviceId === fromDeviceId);
    if (!conversation) return;
    await this.sessionStore.delete(
      sessionStoreKey(conversation.peerUserId, conversation.peerDeviceId),
    );
    await this.sessionStore.delete(
      protocolAddressId(conversation.peerUserId, conversation.peerDeviceId),
    );
    await this.sessionStore.delete(`${conversation.peerUserId}.1`);
    await this.sessionStore.delete(conversation.peerUserId);
    if (__DEV__) {
      console.warn(
        "[SyncService] cleared session after SessionResetRequested",
        fromDeviceId,
      );
    }
    await this.resendUnreceiptedAfterSessionReset(conversation);
  }

  /**
   * Re-encrypt and resend outbox plaintexts that were never receipted.
   * Rate-limited by OUTBOX_MAX_RESENDS per client message id.
   */
  private async resendUnreceiptedAfterSessionReset(
    conversation: Conversation,
  ): Promise<void> {
    const now = this.clock();
    await this.outboxStore.purgeExpired(now);
    if (this.mediaBlobCache) {
      await this.mediaBlobCache.purgeExpired(now);
    }
    const pending = await this.outboxStore.listPendingForPeerDevice(
      conversation.peerDeviceId,
      now,
    );
    for (const entry of pending) {
      if (entry.resendCount >= OUTBOX_MAX_RESENDS) continue;
      try {
        const plaintext = await this.buildResendPlaintext(conversation, entry, now);
        if (!plaintext) continue;
        await this.encryptAndPost(conversation, plaintext);
        await this.outboxStore.incrementResend(entry.clientMessageId, now);
        const local = await this.messageStore.getByClientId(entry.clientMessageId);
        if (local && local.status === "failed") {
          await this.messageStore.updateStatus(local.id, "sent");
        }
      } catch (e) {
        if (isQuietDbCancel(e)) continue;
        if (__DEV__) {
          console.warn(
            "[SyncService] outbox resend failed",
            entry.clientMessageId,
            e instanceof Error ? e.message : e,
          );
        }
      }
    }
  }

  /**
   * Text: re-wrap plaintext with stable clientMessageId.
   * Media (full method): if server attachment still exists → resend descriptor;
   * else re-upload cached encrypted blob (new attachment id) then descriptor;
   * else descriptor-only fallback when blob over cap / evicted.
   */
  private async buildResendPlaintext(
    conversation: Conversation,
    entry: OutboxEntry,
    now: number,
  ): Promise<string | null> {
    if (entry.payloadKind !== "media") {
      return serializeTextPayload(entry.plaintext, entry.clientMessageId);
    }

    let descriptor: MediaPayload | null = null;
    try {
      const parsed = parseSignalPlaintext(entry.plaintext);
      if (parsed.kind === "media") descriptor = parsed.payload;
    } catch {
      descriptor = null;
    }
    if (!descriptor) return null;
    descriptor = {
      ...descriptor,
      clientMessageId: entry.clientMessageId,
    };

    const attachmentId = entry.mediaAttachmentId ?? descriptor.attachmentId;
    let serverOk = false;
    if (this.attachmentExists && attachmentId) {
      try {
        serverOk = await this.attachmentExists(attachmentId);
      } catch {
        serverOk = false;
      }
    }

    if (serverOk) {
      return serializeMediaPayload({ ...descriptor, attachmentId });
    }

    const blob =
      this.mediaBlobCache != null
        ? await this.mediaBlobCache.get(entry.clientMessageId, now)
        : null;

    if (blob && this.reuploadMediaBlob) {
      const fresh = await this.reuploadMediaBlob({
        conversation,
        clientMessageId: entry.clientMessageId,
        descriptor,
        ciphertext: blob.ciphertext,
      });
      const next = {
        ...fresh,
        clientMessageId: entry.clientMessageId,
      };
      await this.outboxStore.upsertPending({
        clientMessageId: entry.clientMessageId,
        localMessageId: entry.localMessageId,
        conversationId: entry.conversationId,
        peerUserId: entry.peerUserId,
        peerDeviceId: entry.peerDeviceId,
        plaintext: serializeMediaPayload(next),
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt,
        payloadKind: "media",
        mediaAttachmentId: next.attachmentId,
        mediaBlobCached: true,
        resendCount: entry.resendCount,
      });
      return serializeMediaPayload(next);
    }

    // Fallback: descriptor-only (receiver may fail download if attachment gone).
    return serializeMediaPayload(descriptor);
  }

  /**
   * Re-encrypt pending group outbox entries with the current sender key
   * (plaintext stays in SQLCipher; ciphertext is never reused across rotations).
   */
  async flushGroupOutbox(): Promise<void> {
    if (!this.groupSenderKeyService) return;
    const now = this.clock();
    await this.outboxStore.purgeExpired(now);
    if (this.mediaBlobCache) {
      await this.mediaBlobCache.purgeExpired(now);
    }
    const pending = await this.outboxStore.listPendingGroups(now);
    for (const entry of pending) {
      if (!entry.groupId) continue;
      if (entry.resendCount >= OUTBOX_MAX_RESENDS) continue;
      try {
        const local = await this.messageStore.getByClientId(entry.clientMessageId);
        // Text: only auto-resend when the local row failed (sendRetry / explicit flush).
        // Media: also resend when the server attachment is gone (blob cache rebuild).
        if (entry.payloadKind !== "media") {
          if (!local || local.status !== "failed") continue;
        } else if (local && local.status !== "failed" && this.attachmentExists) {
          const attId = entry.mediaAttachmentId;
          if (attId) {
            try {
              if (await this.attachmentExists(attId)) continue;
            } catch {
              /* treat as missing → resend */
            }
          }
        }
        const body =
          entry.payloadKind === "media"
            ? await this.buildGroupResendPlaintext(entry, now)
            : entry.plaintext;
        if (!body) continue;
        await this.groupSenderKeyService.encryptAndSendGroupPlaintext(
          entry.groupId,
          body,
        );
        await this.outboxStore.incrementResend(entry.clientMessageId, now);
        if (local && local.status === "failed") {
          await this.messageStore.updateStatus(local.id, "sent");
        }
      } catch (e) {
        if (isQuietDbCancel(e)) continue;
        if (__DEV__) {
          console.warn(
            "[SyncService] group outbox resend failed",
            entry.clientMessageId,
            e instanceof Error ? e.message : e,
          );
        }
      }
    }
  }

  private async buildGroupResendPlaintext(
    entry: OutboxEntry,
    now: number,
  ): Promise<string | null> {
    const conversation: Conversation = {
      id: entry.conversationId,
      peerUserId: entry.peerUserId,
      peerUsername: `group:${(entry.groupId ?? "x").slice(0, 8)}`,
      peerDeviceId: "group",
      lastMessagePreview: "",
      lastMessageAt: 0,
      unreadCount: 0,
    };
    return this.buildResendPlaintext(conversation, entry, now);
  }

  async sendOutgoing(conversationId: string, text: string): Promise<void> {
    const run = this.sendChain.then(() =>
      this.sendOutgoingInner(conversationId, text),
    );
    this.sendChain = run.catch(() => {});
    return run;
  }

  private async sendOutgoingInner(
    conversationId: string,
    text: string,
  ): Promise<void> {
    assertMessageTextWithinLimit(text);
    const conversation = await this.conversationStore.getById(conversationId);
    if (!conversation) throw new Error("Conversation not found");

    const local = await this.identityStore.getLocalIdentity();
    const deviceId = local?.deviceId ?? "local-device";
    const clientId = randomUUID();
    const id = randomUUID();
    const createdAt = this.clock();

    const optimistic: LocalMessage = {
      id,
      clientId,
      conversationId,
      direction: "outgoing",
      kind: "text",
      plaintext: text,
      status: "pending",
      senderDeviceId: deviceId,
      createdAt,
    };
    await this.messageStore.insert(optimistic);

    try {
      const result = await this.encryptAndPost(
        conversation,
        serializeTextPayload(text, clientId),
      );
      await this.messageStore.updateServerEnvelopeId(id, result.envelopeId);
      await this.messageStore.updateStatus(id, "sent");
      await this.conversationStore.upsert({
        ...conversation,
        lastMessagePreview: text.slice(0, 120),
        lastMessageAt: createdAt,
      });
      await this.outboxStore.upsertPending({
        clientMessageId: clientId,
        localMessageId: id,
        conversationId,
        peerUserId: conversation.peerUserId,
        peerDeviceId: conversation.peerDeviceId,
        plaintext: text,
        payloadKind: "text",
        createdAt,
        expiresAt: createdAt + OUTBOX_TTL_MS,
      });
      await this.outboxStore.trimConversation(
        conversationId,
        OUTBOX_MAX_PER_CONVERSATION,
      );
    } catch (e) {
      if (isQuietDbCancel(e)) {
        // Keep optimistic row pending; queue for unlock flush — never mark failed.
        if (this.sendRetry) {
          try {
            const now = this.clock();
            await this.sendRetry.enqueueFailed({
              clientMessageId: clientId,
              localMessageId: id,
              conversationId,
              plaintext: text,
              createdAt: now,
              nextAttemptAt: now,
            });
          } catch (enqueueErr) {
            if (!isQuietDbCancel(enqueueErr)) throw enqueueErr;
          }
        }
        return;
      }
      await this.messageStore.updateStatus(id, "failed");
      if (this.sendRetry) {
        const now = this.clock();
        await this.sendRetry.enqueueFailed({
          clientMessageId: clientId,
          localMessageId: id,
          conversationId,
          plaintext: text,
          createdAt: now,
          nextAttemptAt: now,
        });
        void this.sendRetry.flushDue();
      }
      throw e instanceof Error
        ? e
        : new Error("Message could not be delivered. Check connection and try again.");
    }
  }


  async sendGroupOutgoing(groupId: string, text: string): Promise<void> {
    const run = this.sendChain.then(() => this.sendGroupOutgoingInner(groupId, text));
    this.sendChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async sendGroupOutgoingInner(
    groupId: string,
    text: string,
  ): Promise<void> {
    assertMessageTextWithinLimit(text);
    if (!this.groupSenderKeyService) {
      throw new Error("Group crypto not ready");
    }
    const group = await this.groupStore?.getGroup(groupId);
    if (!group) throw new Error("Group not found");

    const local = await this.identityStore.getLocalIdentity();
    const deviceId = local?.deviceId ?? "local-device";
    if (local) {
      this.groupSenderKeyService.setLocalIdentity(local.userId, local.deviceId);
    }
    const clientId = randomUUID();
    const id = randomUUID();
    const createdAt = this.clock();

    const optimistic = {
      id,
      clientId,
      conversationId: groupId,
      direction: "outgoing" as const,
      kind: "text" as const,
      plaintext: text,
      status: "pending" as const,
      senderDeviceId: deviceId,
      createdAt,
    };
    await this.messageStore.insert(optimistic);

    try {
      const result = await this.groupSenderKeyService.encryptAndSendGroupText(
        groupId,
        text,
      );
      const envelopeId = result.envelopeIds[0] ?? clientId;
      await this.messageStore.updateServerEnvelopeId(id, envelopeId);
      await this.messageStore.updateStatus(id, "sent");
      await this.groupStore?.touchPreview(groupId, text.slice(0, 120), createdAt);
      await this.outboxStore.upsertPending({
        clientMessageId: clientId,
        localMessageId: id,
        conversationId: groupId,
        peerUserId: "group",
        peerDeviceId: "group",
        plaintext: text,
        payloadKind: "text",
        groupId,
        createdAt,
        expiresAt: createdAt + OUTBOX_TTL_MS,
      });
      await this.outboxStore.trimConversation(groupId, OUTBOX_MAX_PER_CONVERSATION);
    } catch (e) {
      if (isQuietDbCancel(e)) {
        if (this.sendRetry) {
          try {
            const now = this.clock();
            await this.sendRetry.enqueueFailed({
              clientMessageId: clientId,
              localMessageId: id,
              conversationId: groupId,
              plaintext: text,
              createdAt: now,
              nextAttemptAt: now,
            });
          } catch (enqueueErr) {
            if (!isQuietDbCancel(enqueueErr)) throw enqueueErr;
          }
        }
        return;
      }
      await this.messageStore.updateStatus(id, "failed");
      if (this.sendRetry) {
        const now = this.clock();
        await this.sendRetry.enqueueFailed({
          clientMessageId: clientId,
          localMessageId: id,
          conversationId: groupId,
          plaintext: text,
          createdAt: now,
          nextAttemptAt: now,
        });
        void this.sendRetry.flushDue();
      }
      throw e instanceof Error
        ? e
        : new Error("Group message could not be delivered. Check connection and try again.");
    }
  }

  async sendOutgoingMedia(
    conversationId: string,
    input: {
      uri: string;
      kind: "voice" | "video";
      mimeType: string;
      durationMs?: number;
      width?: number;
      height?: number;
      groupId?: string;
    },
  ): Promise<void> {
    if (!this.mediaTransfer) throw new Error("Media transfer is not initialized");
    const run = this.sendChain.then(() =>
      this.mediaTransfer!.sendOutgoingMedia({
        conversationId,
        ...input,
      }),
    );
    this.sendChain = run.catch(() => {});
    return run;
  }

  async sendGroupOutgoingMedia(
    groupId: string,
    input: {
      uri: string;
      kind: "voice" | "video";
      mimeType: string;
      durationMs?: number;
      width?: number;
      height?: number;
    },
  ): Promise<void> {
    return this.sendOutgoingMedia(groupId, { ...input, groupId });
  }

  async encryptAndPost(
    conversation: Conversation,
    plaintext: string,
  ): Promise<{ envelopeId: string }> {
    await this.messagesApi.abortBackground();
    this.outboundInFlight++;
    try {
      return await this.signalr.runWithTransportPaused(async () => {
        const targets = await this.resolveFanOutTargets(conversation);
        let primaryEnvelopeId = "";
        for (const target of targets) {
          const payload = await this.signalService.encryptOutgoing(
            target.userId,
            target.deviceId,
            plaintext,
          );
          const result = await this.messagesApi.send({
            recipientUserId: payload.recipientUserId,
            recipientDeviceId: payload.recipientDeviceId,
            messageType: payload.messageType,
            ciphertextBase64: payload.ciphertextBase64,
          });
          if (
            target.userId === conversation.peerUserId &&
            target.deviceId === conversation.peerDeviceId
          ) {
            primaryEnvelopeId = result.envelopeId;
          } else if (!primaryEnvelopeId) {
            primaryEnvelopeId = result.envelopeId;
          }
        }
        return { envelopeId: primaryEnvelopeId };
      });
    } finally {
      this.outboundInFlight--;
    }
  }

  /** Peer devices + own other devices (sent-message sync). Dedupes by deviceId. */
  private async resolveFanOutTargets(
    conversation: Conversation,
  ): Promise<FanOutDevice[]> {
    const byDevice = new Map<string, FanOutDevice>();
    byDevice.set(conversation.peerDeviceId, {
      userId: conversation.peerUserId,
      deviceId: conversation.peerDeviceId,
    });

    if (!this.deviceDirectory) {
      return [...byDevice.values()];
    }

    try {
      const peerDevices = await this.deviceDirectory.listPeerDevices(
        conversation.peerUserId,
      );
      for (const d of peerDevices) {
        byDevice.set(d.deviceId, {
          userId: conversation.peerUserId,
          deviceId: d.deviceId,
        });
      }
    } catch (e) {
      if (__DEV__) {
        console.warn(
          "[SyncService] listPeerDevices failed; using conversation device",
          e instanceof Error ? e.message : e,
        );
      }
    }

    const local = await this.identityStore.getLocalIdentity();
    if (local) {
      try {
        const own = await this.deviceDirectory.listOwnDevices();
        for (const d of own) {
          if (d.deviceId === local.deviceId) continue;
          byDevice.set(d.deviceId, {
            userId: local.userId,
            deviceId: d.deviceId,
          });
        }
      } catch (e) {
        if (__DEV__) {
          console.warn(
            "[SyncService] listOwnDevices failed",
            e instanceof Error ? e.message : e,
          );
        }
      }
    }

    return [...byDevice.values()];
  }

  async sendReaction(input: {
    conversationId: string;
    targetServerEnvelopeId: string;
    emoji: string;
    op: ReactionOp;
    /** When set, reaction is fan-out via Sender Keys. */
    groupId?: string;
  }): Promise<void> {
    const plaintext = serializeReactionPayload({
      op: input.op,
      targetServerEnvelopeId: input.targetServerEnvelopeId,
      emoji: input.emoji,
    });
    if (input.groupId) {
      if (!this.groupSenderKeyService) throw new Error("Group crypto not ready");
      await this.groupSenderKeyService.encryptAndSendGroupPlaintext(
        input.groupId,
        plaintext,
      );
      return;
    }
    const conversation = await this.conversationStore.getById(input.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    await this.encryptAndPost(conversation, plaintext);
  }

  async sendGroupControl(
    groupId: string,
    event: "added" | "removed" | "left" | "renamed",
    opts?: { subjectUserId?: string; name?: string },
  ): Promise<void> {
    if (!this.groupSenderKeyService) throw new Error("Group crypto not ready");
    await this.groupSenderKeyService.sendGroupControl(groupId, event, opts);
  }

  /** Mark outgoing group messages as read by us; send E2EE read receipts to each sender. */
  async markGroupMessagesRead(
    groupId: string,
    messages: { clientMessageId: string; senderUserId: string; senderDeviceId: string }[],
  ): Promise<void> {
    if (!this.groupReceiptStore || messages.length === 0) return;
    const local = await this.identityStore.getLocalIdentity();
    if (!local) return;
    const bySender = new Map<string, { userId: string; deviceId: string; ids: string[] }>();
    const now = this.clock();
    for (const m of messages) {
      if (m.senderUserId === local.userId) continue;
      await this.groupReceiptStore.upsert({
        groupId,
        clientMessageId: m.clientMessageId,
        fromUserId: local.userId,
        fromDeviceId: local.deviceId,
        kind: "read",
        at: now,
      });
      const key = `${m.senderUserId}:${m.senderDeviceId}`;
      const bucket = bySender.get(key) ?? {
        userId: m.senderUserId,
        deviceId: m.senderDeviceId,
        ids: [],
      };
      bucket.ids.push(m.clientMessageId);
      bySender.set(key, bucket);
    }
    for (const bucket of bySender.values()) {
      const conversation = {
        id: groupId,
        peerUserId: bucket.userId,
        peerUsername: bucket.userId.slice(0, 8),
        peerDeviceId: bucket.deviceId,
        lastMessagePreview: "",
        lastMessageAt: 0,
        unreadCount: 0,
      };
      await this.encryptAndPost(
        conversation,
        serializeReceiptPayload(bucket.ids, { kind: "read", groupId }),
      );
    }
  }

  getGroupReceiptAggregate(groupId: string, clientMessageId: string) {
    return this.groupReceiptStore?.aggregate(groupId, clientMessageId) ?? null;
  }

}
