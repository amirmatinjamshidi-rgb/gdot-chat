import type { ApiClient } from "./api-client";
import { MEDIA_CHUNK_TIMEOUT_MS } from "@/lib/config";

export interface CreateAttachmentRequest {
  recipientUserId: string;
  recipientDeviceId: string;
  sizeBytes: number;
}

export interface CreateAttachmentResponse {
  attachmentId: string;
  chunkSizeBytes: number;
  chunkCount: number;
  expiresAt: string;
}

export interface AttachmentStatusDto {
  attachmentId: string;
  sizeBytes: number;
  chunkSizeBytes: number;
  chunkCount: number;
  uploadedChunks: number[];
  status: string;
  expiresAt: string;
}

export class AttachmentsApi {
  constructor(private readonly client: ApiClient) {}

  create(body: CreateAttachmentRequest): Promise<CreateAttachmentResponse> {
    return this.client.postPriority<CreateAttachmentResponse>("/attachments", body);
  }

  putChunk(
    attachmentId: string,
    index: number,
    ciphertext: Uint8Array,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.client.putOctetStream(
      `/attachments/${attachmentId}/chunks/${index}`,
      ciphertext,
      MEDIA_CHUNK_TIMEOUT_MS,
      signal,
    );
  }

  getStatus(attachmentId: string): Promise<AttachmentStatusDto> {
    return this.client.getPriority<AttachmentStatusDto>(`/attachments/${attachmentId}`);
  }

  complete(attachmentId: string): Promise<void> {
    return this.client.postPriority<void>(`/attachments/${attachmentId}/complete`);
  }

  getChunk(
    attachmentId: string,
    index: number,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    return this.client.getOctetStream(
      `/attachments/${attachmentId}/chunks/${index}`,
      MEDIA_CHUNK_TIMEOUT_MS,
      signal,
    );
  }

  downloadComplete(attachmentId: string): Promise<void> {
    return this.client.postPriority<void>(
      `/attachments/${attachmentId}/download-complete`,
    );
  }

  delete(attachmentId: string): Promise<void> {
    return this.client.delete<void>(`/attachments/${attachmentId}`);
  }
}
