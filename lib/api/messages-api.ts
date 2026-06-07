import type { ApiClient } from "./api-client";
import type { MessageEnvelopeDto, SendMessageRequest } from "./api-types";

export class MessagesApi {
  constructor(private readonly client: ApiClient) {}

  abortBackground(): Promise<void> {
    return this.client.abortBackgroundRequests();
  }

  send(body: SendMessageRequest): Promise<{ envelopeId: string }> {
    return this.client.postPriority<{ envelopeId: string }>("/messages", body);
  }

  getPending(limit = 50): Promise<MessageEnvelopeDto[]> {
    return this.client.get<MessageEnvelopeDto[]>(
      `/messages/pending?limit=${limit}`,
    );
  }

  ack(envelopeId: string): Promise<void> {
    return this.client.post<void>(`/messages/${envelopeId}/ack`);
  }
}
