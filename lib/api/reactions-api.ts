import type { ApiClient } from "./api-client";
import type { ReactionPayload } from "@/components/reactions/types";

export class ReactionsApi {
  constructor(private readonly client: ApiClient) {}

  send(body: ReactionPayload): Promise<void> {
    return this.client.post<void>("/messages/reactions", {
      messageId: body.messageId,
      conversationId: body.conversationId,
      emoji: body.emoji,
      userId: body.userId,
      recipientDeviceId: body.recipientDeviceId,
      serverEnvelopeId: body.serverEnvelopeId ?? null,
    });
  }
}
