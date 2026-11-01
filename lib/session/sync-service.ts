import type { MessagesApi } from "@/lib/api/messages-api";
import type { SignalRClient } from "@/lib/api/signalr-client";
import {
  ENABLE_SIGNALR,
  SYNC_POLL_INTERVAL_MS,
  SYNC_PULL_DEBOUNCE_MS,
} from "@/lib/config";
import { decideSyncTransport } from "@/lib/session/sync-transport-policy";
import type { SignalService } from "@/lib/crypto/signal-service";
import { base64ToBytes } from "@/lib/crypto/encoding";
import { randomUUID } from "@/lib/crypto/random-id";
import type { IConversationStore } from "@/lib/db/conversation-store";
import type { IIdentityStore } from "@/lib/db/identity-store";
import type { IMessageStore } from "@/lib/db/message-store";
import type { IReactionStore } from "@/lib/db/reaction-store";
import type { Conversation, LocalMessage } from "@/lib/db/types";
import { agentDebugLog } from "@/lib/debug-agent-log";
import type { MediaTransferService } from "@/lib/media/media-transfer";
import {
  parseSignalPlaintext,
  serializeReactionPayload,
  serializeTextPayload,
  type ReactionOp,
} from "@/lib/protocol/payload";
import { assertMessageTextWithinLimit } from "@/lib/protocol/message-limits";
import { isOfflineToken, type AuthStore } from "@/lib/session/auth-store";
import { useMediaStore } from "@/stores/media-store";

export type SyncErrorHandler = (message: string) => void;
export type ReactionAppliedHandler = (conversationId: string) => void;

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
  ) {}

  setMediaTransfer(mediaTransfer: MediaTransferService): void {
    this.mediaTransfer = mediaTransfer;
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
    // #region agent log
    agentDebugLog(
      "sync-service.ts:startInner",
      "sync started",
      { instanceId: this.instanceId },
      "J",
      "post-fix",
    );
    // #endregion

    await this.signalService.replenishLocalPreKeysIfNeeded();
    void this.mediaTransfer?.resumeInterrupted();

    const accessToken = await this.authStore.getAccessToken();
    if (isOfflineToken(accessToken)) {
      // #region agent log
      agentDebugLog(
        "sync-service.ts:startInner",
        "offline tokens cleared",
        {},
        "O",
        "post-fix",
      );
      // #endregion
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
      // #region agent log
      agentDebugLog(
        "sync-service.ts:pullPending",
        "pullPending skipped during send",
        { outboundInFlight: this.outboundInFlight },
        "K",
        "post-fix",
      );
      // #endregion
      return;
    }
    // #region agent log
    agentDebugLog(
      "sync-service.ts:pullPending",
      "pullPending start",
      {},
      "B",
    );
    // #endregion
    try {
      const envelopes = await this.messagesApi.getPending();
      const localDeviceId = await this.authStore.getDeviceId();
      if (!localDeviceId) return;

      for (const env of envelopes) {
        const conversation = await this.findConversationForSender(
          env.senderDeviceId,
        );
        if (!conversation) {
          if (__DEV__) {
            console.warn(
              "[SyncService] unknown sender device; add contact first",
              env.senderDeviceId,
            );
          }
          continue;
        }

        let plaintext: string;
        try {
          plaintext = await this.signalService.decryptIncoming(
            conversation.peerUserId,
            env.messageType as 2 | 3,
            base64ToBytes(env.ciphertextBase64),
          );
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : "Failed to decrypt message";
          this.onError?.(msg);
          if (__DEV__) console.warn("[SyncService] decrypt failed", msg);
          continue;
        }

        const parsed = parseSignalPlaintext(plaintext);
        if (parsed.kind === "media") {
          if (!this.mediaTransfer) {
            this.onError?.("Media transfer is not initialized");
            continue;
          }
          await this.mediaTransfer.ingestIncomingMedia({
            conversation,
            payload: parsed.payload,
            senderDeviceId: env.senderDeviceId,
            serverEnvelopeId: env.id,
            createdAt: Date.parse(env.createdAt) || Date.now(),
            messageType: env.messageType as 2 | 3,
          });
          await this.messagesApi.ack(env.id);
          if (useMediaStore.getState().autoDownloadPolicy !== "never") {
            void this.mediaTransfer.downloadAttachment(parsed.payload.attachmentId);
          }
          continue;
        }

        if (parsed.kind === "reaction") {
          await this.applyIncomingReaction(
            conversation,
            conversation.peerUserId,
            parsed.payload.op,
            parsed.payload.emoji,
            parsed.payload.targetServerEnvelopeId,
          );
          await this.messagesApi.ack(env.id);
          continue;
        }

        const text =
          parsed.kind === "text" ? parsed.payload.text : parsed.text;

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
          createdAt: Date.parse(env.createdAt) || Date.now(),
        };
        await this.messageStore.insert(msg);
        await this.conversationStore.upsert({
          ...conversation,
          lastMessagePreview: text.slice(0, 120),
          lastMessageAt: msg.createdAt,
          unreadCount: conversation.unreadCount + 1,
        });
        await this.messagesApi.ack(env.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const abortedForSend =
        this.outboundInFlight > 0 &&
        (msg.includes("Aborted") || msg.includes("abort"));
      if (abortedForSend) {
        // #region agent log
        agentDebugLog(
          "sync-service.ts:pullPending",
          "pullPending aborted for send",
          {},
          "L",
          "post-fix",
        );
        // #endregion
        return;
      }
      // #region agent log
      agentDebugLog(
        "sync-service.ts:pullPending",
        "pullPending error",
        { error: msg },
        "B",
      );
      // #endregion
      if (__DEV__) {
        console.warn("[SyncService] pullPending failed", msg);
      }
    } finally {
      // #region agent log
      agentDebugLog(
        "sync-service.ts:pullPending",
        "pullPending end",
        {},
        "B",
      );
      // #endregion
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
    // #region agent log
    agentDebugLog(
      "sync-service.ts:sendOutgoing",
      "sendOutgoing start",
      { conversationId },
      "A",
      "post-fix",
    );
    // #endregion
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
    // #region agent log
    agentDebugLog(
      "sync-service.ts:sendOutgoing",
      "after message insert",
      { messageId: id },
      "A",
    );
    // #endregion

    await this.messagesApi.abortBackground();
    this.outboundInFlight++;
    try {
      await this.signalr.runWithTransportPaused(async () => {
        const payload = await this.signalService.encryptOutgoing(
          conversation.peerUserId,
          conversation.peerDeviceId,
          serializeTextPayload(text),
        );
        // #region agent log
        agentDebugLog(
          "sync-service.ts:sendOutgoing",
          "after encrypt",
          { messageType: payload.messageType },
          "A",
        );
        // #endregion
        // #region agent log
        agentDebugLog(
          "sync-service.ts:sendOutgoing",
          "posting message to server",
          {
            recipientUserId: payload.recipientUserId,
            recipientDeviceId: payload.recipientDeviceId,
          },
          "A",
          "post-fix",
        );
        // #endregion
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
      // #region agent log
      agentDebugLog(
        "sync-service.ts:sendOutgoing",
        "sendOutgoing success",
        { messageId: id },
        "A",
      );
      // #endregion
    } catch (e) {
      // #region agent log
      agentDebugLog(
        "sync-service.ts:sendOutgoing",
        "sendOutgoing error",
        { error: e instanceof Error ? e.message : String(e) },
        "A",
      );
      // #endregion
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

  private async applyIncomingReaction(
    conversation: Conversation,
    senderUserId: string,
    op: ReactionOp,
    emoji: string,
    targetServerEnvelopeId: string,
  ): Promise<void> {
    const target = await this.messageStore.getByServerEnvelopeId(
      targetServerEnvelopeId,
    );
    if (!target) {
      if (__DEV__) {
        console.warn(
          "[SyncService] reaction for unknown envelope",
          targetServerEnvelopeId,
        );
      }
      return;
    }
    await this.reactionStore.apply(target.id, emoji, senderUserId, op);
    this.onReactionApplied?.(conversation.id);
  }

  private async findConversationForSender(
    senderDeviceId: string,
  ): Promise<Conversation | null> {
    const all = await this.conversationStore.listAll();
    return all.find((c) => c.peerDeviceId === senderDeviceId) ?? null;
  }
}
