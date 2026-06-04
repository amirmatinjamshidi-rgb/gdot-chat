import type { MessagesApi } from "@/lib/api/messages-api";
import type { SignalRClient } from "@/lib/api/signalr-client";
import { SYNC_POLL_INTERVAL_MS } from "@/lib/config";
import type { SignalService } from "@/lib/crypto/signal-service";
import { base64ToBytes } from "@/lib/crypto/encoding";
import { randomUUID } from "@/lib/crypto/random-id";
import type { IConversationStore } from "@/lib/db/conversation-store";
import type { IIdentityStore } from "@/lib/db/identity-store";
import type { IMessageStore } from "@/lib/db/message-store";
import type { Conversation, LocalMessage } from "@/lib/db/types";
import type { AuthStore } from "@/lib/session/auth-store";

export class SyncService {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(
    private readonly messagesApi: MessagesApi,
    private readonly signalr: SignalRClient,
    private readonly signalService: SignalService,
    private readonly messageStore: IMessageStore,
    private readonly conversationStore: IConversationStore,
    private readonly identityStore: IIdentityStore,
    private readonly authStore: AuthStore,
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.signalr.setEnvelopeHandler(() => {
      void this.pullPending();
    });

    try {
      await this.signalr.connect();
    } catch {
      // Hub optional when server offline
    }

    this.pollTimer = setInterval(() => {
      void this.pullPending();
    }, SYNC_POLL_INTERVAL_MS);

    await this.pullPending();
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
    try {
      const envelopes = await this.messagesApi.getPending();
      const localDeviceId = await this.authStore.getDeviceId();
      if (!localDeviceId) return;

      for (const env of envelopes) {
        const plaintext = await this.signalService.decryptIncoming(
          env.senderDeviceId,
          env.messageType as 2 | 3,
          base64ToBytes(env.ciphertextBase64),
        );

        let conversation = await this.findConversationForSender(
          env.senderDeviceId,
        );
        if (!conversation) {
          conversation = await this.createPlaceholderConversation(
            env.senderDeviceId,
          );
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
    } catch {
      // Server unreachable — local-only mode
    }
  }

  async sendOutgoing(conversationId: string, text: string): Promise<void> {
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

    try {
      const payload = await this.signalService.encryptOutgoing(
        conversation.peerUserId,
        conversation.peerDeviceId,
        text,
      );
      const result = await this.messagesApi.send({
        recipientUserId: payload.recipientUserId,
        recipientDeviceId: payload.recipientDeviceId,
        messageType: payload.messageType,
        ciphertextBase64: payload.ciphertextBase64,
      });
      await this.messageStore.updateStatus(id, "sent");
      await this.conversationStore.upsert({
        ...conversation,
        lastMessagePreview: text.slice(0, 120),
        lastMessageAt: createdAt,
      });
      void result;
    } catch {
      await this.messageStore.updateStatus(id, "failed");
      throw new Error("Message could not be delivered. Check connection and try again.");
    }
  }

  private async findConversationForSender(
    senderDeviceId: string,
  ): Promise<Conversation | null> {
    const all = await this.conversationStore.listAll();
    return all.find((c) => c.peerDeviceId === senderDeviceId) ?? null;
  }

  private async createPlaceholderConversation(
    senderDeviceId: string,
  ): Promise<Conversation> {
    const c: Conversation = {
      id: randomUUID(),
      peerUserId: senderDeviceId,
      peerUsername: "Unknown",
      peerDeviceId: senderDeviceId,
      lastMessagePreview: "",
      lastMessageAt: Date.now(),
      unreadCount: 0,
    };
    await this.conversationStore.upsert(c);
    return c;
  }
}
