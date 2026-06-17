import type { MessagesApi } from "@/lib/api/messages-api";
import type { SignalRClient } from "@/lib/api/signalr-client";
import { ENABLE_SIGNALR, SYNC_POLL_INTERVAL_MS } from "@/lib/config";
import type { SignalService } from "@/lib/crypto/signal-service";
import { base64ToBytes } from "@/lib/crypto/encoding";
import { randomUUID } from "@/lib/crypto/random-id";
import type { IConversationStore } from "@/lib/db/conversation-store";
import type { IIdentityStore } from "@/lib/db/identity-store";
import type { IMessageStore } from "@/lib/db/message-store";
import type { Conversation, LocalMessage } from "@/lib/db/types";
import { agentDebugLog } from "@/lib/debug-agent-log";
import type { AuthStore } from "@/lib/session/auth-store";
import { isOfflineToken } from "@/lib/session/auth-store";

export type SyncErrorHandler = (message: string) => void;

export class SyncService {
  readonly instanceId = randomUUID();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private onError: SyncErrorHandler | null = null;
  private pullChain: Promise<void> = Promise.resolve();
  private sendChain: Promise<void> = Promise.resolve();
  private startInFlight: Promise<void> | null = null;
  private outboundInFlight = 0;

  constructor(
    private readonly messagesApi: MessagesApi,
    private readonly signalr: SignalRClient,
    private readonly signalService: SignalService,
    private readonly messageStore: IMessageStore,
    private readonly conversationStore: IConversationStore,
    private readonly identityStore: IIdentityStore,
    private readonly authStore: AuthStore,
  ) {}

  setErrorHandler(handler: SyncErrorHandler | null): void {
    this.onError = handler;
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

    this.pollTimer = setInterval(() => {
      void this.pullPending();
    }, SYNC_POLL_INTERVAL_MS);

    void this.pullPending();

    if (ENABLE_SIGNALR) {
      this.signalr.setEnvelopeHandler(() => {
        void this.pullPending();
      });
      try {
        await this.signalr.connect();
      } catch {
        if (__DEV__) {
          console.warn("[SyncService] SignalR connect failed");
        }
      }
    } else {
      // #region agent log
      agentDebugLog(
        "sync-service.ts:startInner",
        "signalr disabled poll-only",
        {},
        "L",
        "post-fix",
      );
      // #endregion
    }
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.signalr.setEnvelopeHandler(null);
    await this.signalr.disconnect();
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

        const msg: LocalMessage = {
          id: randomUUID(),
          clientId: randomUUID(),
          conversationId: conversation.id,
          direction: "incoming",
          plaintext,
          messageType: env.messageType as 2 | 3,
          status: "delivered",
          senderDeviceId: env.senderDeviceId,
          serverEnvelopeId: env.id,
          createdAt: Date.parse(env.createdAt) || Date.now(),
        };
        await this.messageStore.insert(msg);
        await this.conversationStore.upsert({
          ...conversation,
          lastMessagePreview: plaintext.slice(0, 120),
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
          text,
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

  private async findConversationForSender(
    senderDeviceId: string,
  ): Promise<Conversation | null> {
    const all = await this.conversationStore.listAll();
    return all.find((c) => c.peerDeviceId === senderDeviceId) ?? null;
  }
}
