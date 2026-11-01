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
import type { IConversationStore } from "@/lib/db/conversation-store";
import { MemorySessionResetCooldownStore } from "@/lib/db/envelope-attempt-store";
import type { IEnvelopeAttemptStore } from "@/lib/db/envelope-attempt-store";
import type { IEnvelopeQuarantineStore } from "@/lib/db/envelope-quarantine-store";
import type { IIdentityStore } from "@/lib/db/identity-store";
import type { IMessageStore } from "@/lib/db/message-store";
import type { IReactionStore } from "@/lib/db/reaction-store";
import type { ISessionStore } from "@/lib/db/session-store";
import type { Conversation, LocalMessage } from "@/lib/db/types";
import type { MediaTransferService } from "@/lib/media/media-transfer";
import {
  serializeReactionPayload,
  serializeTextPayload,
  type ReactionOp,
} from "@/lib/protocol/payload";
import { assertMessageTextWithinLimit } from "@/lib/protocol/message-limits";
import { isOfflineToken, type AuthStore } from "@/lib/session/auth-store";
import { appLockStore } from "@/lib/session/app-lock-store";
import { InboundEnvelopeProcessor } from "@/lib/session/inbound/inbound-envelope-processor";
import { systemClock, type Clock } from "@/lib/session/inbound/constants";

export type SyncErrorHandler = (message: string) => void;
export type ReactionAppliedHandler = (conversationId: string) => void;

export type SyncServiceInboundDeps = {
  quarantineStore: IEnvelopeQuarantineStore;
  attemptStore: IEnvelopeAttemptStore;
  sessionResetApi: SessionResetApi;
  sessionStore: ISessionStore;
  clock?: Clock;
  resolveUsername?: (userId: string) => Promise<string | null>;
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
    this.clock = inboundDeps.clock ?? systemClock;
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
      isDbReady: () => appLockStore.isUnlocked,
      clock: this.clock,
      resolveUsername: inboundDeps.resolveUsername,
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

    await this.signalService.replenishLocalPreKeysIfNeeded();
    void this.mediaTransfer?.resumeInterrupted();

    const accessToken = await this.authStore.getAccessToken();
    if (isOfflineToken(accessToken)) {
      await this.authStore.clearSessionExpired();
      this.started = false;
      return;
    }

    this.signalr.setPreKeysLowHandler(() => {
      void this.signalService.replenishLocalPreKeysIfNeeded().catch((e) => {
        console.warn(
          "[SyncService] PreKeysLow replenish failed",
          e instanceof Error ? e.message : e,
        );
      });
    });
    this.signalr.setSessionResetHandler((fromDeviceId) => {
      void this.handleSessionResetRequested(fromDeviceId);
    });
    this.signalr.setEnvelopeHandler(() => {
      this.schedulePullPending();
    });
    this.signalr.setConnectionHandler((connected) => {
      this.signalRConnected = connected;
      if (!this.started || !this.appInForeground) return;
      if (connected) {
        this.stopPolling();
        this.schedulePullPending();
      } else {
        // Live push lost (or SignalR disabled path) — poll until reconnect.
        this.startPolling();
      }
    });

    await this.applyTransportPolicy({ syncIfConnected: true });
    // Always try one inbox pull on start (covers poll-only and SignalR race).
    void this.pullPending();
  }

  async stop(): Promise<void> {
    this.started = false;
    this.clearPullDebounce();
    this.stopPolling();
    this.signalr.setEnvelopeHandler(null);
    this.signalr.setConnectionHandler(null);
    this.signalr.setPreKeysLowHandler(null);
    this.signalr.setSessionResetHandler(null);
    this.signalRConnected = false;
    await this.signalr.disconnect();
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
    await this.sessionStore.delete(`${conversation.peerUserId}.1`);
    await this.sessionStore.delete(conversation.peerUserId);
    if (__DEV__) {
      console.warn(
        "[SyncService] cleared session after SessionResetRequested",
        fromDeviceId,
      );
    }
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
    const createdAt = Date.now();

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

    await this.messagesApi.abortBackground();
    this.outboundInFlight++;
    try {
      await this.signalr.runWithTransportPaused(async () => {
        const payload = await this.signalService.encryptOutgoing(
          conversation.peerUserId,
          conversation.peerDeviceId,
          serializeTextPayload(text),
        );
        const result = await this.messagesApi.send({
          recipientUserId: payload.recipientUserId,
          recipientDeviceId: payload.recipientDeviceId,
          messageType: payload.messageType,
          ciphertextBase64: payload.ciphertextBase64,
        });
        await this.messageStore.updateServerEnvelopeId(id, result.envelopeId);
        await this.messageStore.updateStatus(id, "sent");
        await this.conversationStore.upsert({
          ...conversation,
          lastMessagePreview: text.slice(0, 120),
          lastMessageAt: createdAt,
        });
        void result;
      });
    } catch (e) {
      await this.messageStore.updateStatus(id, "failed");
      throw e instanceof Error
        ? e
        : new Error("Message could not be delivered. Check connection and try again.");
    } finally {
      this.outboundInFlight--;
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

  async encryptAndPost(
    conversation: Conversation,
    plaintext: string,
  ): Promise<{ envelopeId: string }> {
    await this.messagesApi.abortBackground();
    this.outboundInFlight++;
    try {
      return await this.signalr.runWithTransportPaused(async () => {
        const payload = await this.signalService.encryptOutgoing(
          conversation.peerUserId,
          conversation.peerDeviceId,
          plaintext,
        );
        const result = await this.messagesApi.send({
          recipientUserId: payload.recipientUserId,
          recipientDeviceId: payload.recipientDeviceId,
          messageType: payload.messageType,
          ciphertextBase64: payload.ciphertextBase64,
        });
        return { envelopeId: result.envelopeId };
      });
    } finally {
      this.outboundInFlight--;
    }
  }

  async sendReaction(input: {
    conversationId: string;
    targetServerEnvelopeId: string;
    emoji: string;
    op: ReactionOp;
  }): Promise<void> {
    const conversation = await this.conversationStore.getById(input.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    const plaintext = serializeReactionPayload({
      op: input.op,
      targetServerEnvelopeId: input.targetServerEnvelopeId,
      emoji: input.emoji,
    });
    await this.encryptAndPost(conversation, plaintext);
  }

}
