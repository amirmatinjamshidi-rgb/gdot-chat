import type { AttachmentsApi } from "@/lib/api/attachments-api";
import { ApiError } from "@/lib/api/api-client";
import { base64UrlToBytes } from "@/lib/crypto/encoding";
import {
  decryptChunk,
  encryptChunk,
  generateMediaKey,
  generateNoncePrefix,
  plainChunkLength,
} from "@/lib/crypto/media-aead";
import { randomUUID } from "@/lib/crypto/random-id";
import type { IAttachmentStore } from "@/lib/db/attachment-store";
import type { IConversationStore } from "@/lib/db/conversation-store";
import type { IIdentityStore } from "@/lib/db/identity-store";
import type { IMessageStore } from "@/lib/db/message-store";
import type {
  Conversation,
  LocalAttachment,
  LocalMessage,
} from "@/lib/db/types";
import {
  createOutputFile as defaultCreateOutputFile,
  extensionForMime,
  openExistingFile as defaultOpenExistingFile,
  type RandomAccessFile,
} from "@/lib/media/chunk-file";
import {
  encodeMediaKey,
  encodeNoncePrefix,
  MEDIA_ALGORITHM,
  mediaPreviewLabel,
  serializeMediaPayload,
  type MediaKind,
  type MediaPayload,
} from "@/lib/protocol/payload";
import { useMediaStore } from "@/stores/media-store";

export type SendMediaInput = {
  conversationId: string;
  uri: string;
  kind: MediaKind;
  mimeType: string;
  durationMs?: number;
  width?: number;
  height?: number;
};

export type MediaFileAccess = {
  openExistingFile(uri: string): Promise<RandomAccessFile>;
  createOutputFile(
    attachmentId: string,
    extension: string,
    size: number,
  ): Promise<{ file: RandomAccessFile; uri: string }>;
};

export class MediaTransferService {
  private readonly files: MediaFileAccess;

  constructor(
    private readonly attachmentsApi: AttachmentsApi,
    private readonly messageStore: IMessageStore,
    private readonly attachmentStore: IAttachmentStore,
    private readonly conversationStore: IConversationStore,
    private readonly identityStore: IIdentityStore,
    private readonly sendSignal: (
      conversation: Conversation,
      plaintext: string,
    ) => Promise<{ envelopeId: string }>,
    files?: MediaFileAccess,
  ) {
    this.files = files ?? {
      openExistingFile: defaultOpenExistingFile,
      createOutputFile: defaultCreateOutputFile,
    };
  }

  async sendOutgoingMedia(input: SendMediaInput): Promise<void> {
    const conversation = await this.conversationStore.getById(
      input.conversationId,
    );
    if (!conversation) throw new Error("Conversation not found");
    const local = await this.identityStore.getLocalIdentity();
    const source = await this.files.openExistingFile(input.uri);
    const size = source.size;
    if (size <= 0) throw new Error("Recording is empty");

    const key = generateMediaKey();
    const noncePrefix = generateNoncePrefix();
    const messageId = randomUUID();
    const createdAt = Date.now();
    const tempId = `local-${randomUUID()}`;

    const message: LocalMessage = {
      id: messageId,
      clientId: randomUUID(),
      conversationId: input.conversationId,
      direction: "outgoing",
      kind: input.kind,
      plaintext: "",
      status: "uploading",
      senderDeviceId: local?.deviceId ?? "local-device",
      createdAt,
      attachmentId: tempId,
    };
    await this.messageStore.insert(message);
    await this.attachmentStore.upsert({
      attachmentId: tempId,
      messageId,
      kind: input.kind,
      mimeType: input.mimeType,
      plainSizeBytes: size,
      durationMs: input.durationMs,
      width: input.width,
      height: input.height,
      chunkSize: 0,
      chunkCount: 0,
      mediaKey: key,
      noncePrefix,
      sourceUri: input.uri,
      localUri: input.uri,
      transferState: "uploading",
      uploadedChunks: [],
      downloadedChunks: [],
      createdAt,
      updatedAt: createdAt,
    });

    try {
      const created = await this.attachmentsApi.create({
        recipientUserId: conversation.peerUserId,
        recipientDeviceId: conversation.peerDeviceId,
        sizeBytes: size,
      });

      const row: LocalAttachment = {
        attachmentId: created.attachmentId,
        messageId,
        kind: input.kind,
        mimeType: input.mimeType,
        plainSizeBytes: size,
        durationMs: input.durationMs,
        width: input.width,
        height: input.height,
        chunkSize: created.chunkSizeBytes,
        chunkCount: created.chunkCount,
        mediaKey: key,
        noncePrefix,
        sourceUri: input.uri,
        localUri: input.uri,
        transferState: "uploading",
        uploadedChunks: [],
        downloadedChunks: [],
        createdAt,
        updatedAt: Date.now(),
      };
      await this.attachmentStore.upsert(row);
      await this.messageStore.updateAttachmentId(messageId, created.attachmentId);
      await this.attachmentStore.delete(tempId);

      await this.uploadRemainingChunks(row, source);
      await this.finishOutgoingSignal(conversation, row, messageId, createdAt);
    } catch (e) {
      await this.messageStore.updateStatus(messageId, "failed");
      const stored = await this.attachmentStore.getByMessageId(messageId);
      if (stored) {
        await this.attachmentStore.updateTransfer(stored.attachmentId, {
          transferState: "failed",
        });
      }
      throw e instanceof Error ? e : new Error("Failed to send media");
    } finally {
      await source.close();
    }
  }

  async ingestIncomingMedia(params: {
    conversation: Conversation;
    payload: MediaPayload;
    senderDeviceId: string;
    serverEnvelopeId: string;
    createdAt: number;
    messageType: 2 | 3;
  }): Promise<void> {
    const existing = await this.messageStore.getByServerEnvelopeId(
      params.serverEnvelopeId,
    );
    if (existing) return;

    let transferState: LocalAttachment["transferState"] = "pending";
    try {
      const status = await this.attachmentsApi.getStatus(
        params.payload.attachmentId,
      );
      if (
        status.sizeBytes !== params.payload.size ||
        status.chunkSizeBytes !== params.payload.chunkSize ||
        status.chunkCount !== params.payload.chunkCount
      ) {
        transferState = "failed";
      }
    } catch {
      transferState = "failed";
    }

    const messageId = randomUUID();
    const message: LocalMessage = {
      id: messageId,
      clientId: randomUUID(),
      conversationId: params.conversation.id,
      direction: "incoming",
      kind: params.payload.kind,
      plaintext: "",
      messageType: params.messageType,
      status: transferState === "failed" ? "download_failed" : "delivered",
      senderDeviceId: params.senderDeviceId,
      createdAt: params.createdAt,
      serverEnvelopeId: params.serverEnvelopeId,
      attachmentId: params.payload.attachmentId,
    };
    await this.messageStore.insert(message);
    await this.attachmentStore.upsert({
      attachmentId: params.payload.attachmentId,
      messageId,
      kind: params.payload.kind,
      mimeType: params.payload.mimeType,
      plainSizeBytes: params.payload.size,
      durationMs: params.payload.durationMs,
      width: params.payload.width,
      height: params.payload.height,
      chunkSize: params.payload.chunkSize,
      chunkCount: params.payload.chunkCount,
      mediaKey: base64UrlToBytes(params.payload.key),
      noncePrefix: base64UrlToBytes(params.payload.noncePrefix),
      transferState,
      uploadedChunks: [],
      downloadedChunks: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await this.conversationStore.upsert({
      ...params.conversation,
      lastMessagePreview: mediaPreviewLabel(params.payload.kind),
      lastMessageAt: params.createdAt,
      unreadCount: params.conversation.unreadCount + 1,
    });
  }

  async downloadAttachment(attachmentId: string): Promise<void> {
    const row = await this.attachmentStore.get(attachmentId);
    if (!row) throw new Error("Attachment not found");
    if (row.transferState === "available" && row.localUri) return;

    const status = await this.attachmentsApi.getStatus(attachmentId);
    if (
      status.sizeBytes !== row.plainSizeBytes ||
      status.chunkSizeBytes !== row.chunkSize ||
      status.chunkCount !== row.chunkCount
    ) {
      throw new Error(
        "Attachment metadata does not match the encrypted descriptor",
      );
    }

    await this.messageStore.updateStatus(row.messageId, "downloading");
    await this.attachmentStore.updateTransfer(attachmentId, {
      transferState: "downloading",
    });

    const downloaded = new Set(row.downloadedChunks);
    const dest = row.localUri
      ? { file: await this.files.openExistingFile(row.localUri), uri: row.localUri }
      : await this.files.createOutputFile(
          attachmentId,
          extensionForMime(row.mimeType),
          row.plainSizeBytes,
        );

    try {
      for (let i = 0; i < row.chunkCount; i++) {
        if (downloaded.has(i)) continue;
        const ciphertext = await this.attachmentsApi.getChunk(attachmentId, i);
        const plain = decryptChunk({
          key: row.mediaKey,
          noncePrefix: row.noncePrefix,
          attachmentId,
          chunkIndex: i,
          chunkCount: row.chunkCount,
          plaintextSize: row.plainSizeBytes,
          ciphertext,
        });
        await dest.file.write(i * row.chunkSize, plain);
        downloaded.add(i);
        await this.attachmentStore.updateTransfer(attachmentId, {
          downloadedChunks: [...downloaded].sort((a, b) => a - b),
          localUri: dest.uri,
        });
      }
      await dest.file.close();
      await this.attachmentsApi.downloadComplete(attachmentId);
      await this.attachmentStore.updateTransfer(attachmentId, {
        transferState: "available",
        localUri: dest.uri,
        downloadedChunks: [...downloaded].sort((a, b) => a - b),
      });
      await this.messageStore.updateStatus(row.messageId, "available");
    } catch (e) {
      await this.attachmentStore.updateTransfer(attachmentId, {
        transferState: "failed",
      });
      await this.messageStore.updateStatus(row.messageId, "download_failed");
      if (e instanceof ApiError && e.status === 404) {
        throw new Error("This media is no longer available on the server.");
      }
      throw e instanceof Error ? e : new Error("Download failed");
    }
  }

  async resumeInterrupted(): Promise<void> {
    const rows = await this.attachmentStore.listIncomplete();
    for (const row of rows) {
      try {
        if (row.transferState === "uploading") {
          await this.resumeOutgoing(row);
          continue;
        }
        if (useMediaStore.getState().autoDownloadPolicy === "never") continue;
        await this.downloadAttachment(row.attachmentId);
      } catch {
        /* resume best-effort */
      }
    }
  }

  private async resumeOutgoing(row: LocalAttachment): Promise<void> {
    if (!row.sourceUri) return;
    const conversation = await this.conversationStore.getById(
      (await this.messageStore.getById(row.messageId))?.conversationId ?? "",
    );
    if (!conversation) return;
    const source = await this.files.openExistingFile(row.sourceUri);
    try {
      await this.uploadRemainingChunks(row, source);
      const message = await this.messageStore.getById(row.messageId);
      if (message && !message.serverEnvelopeId) {
        await this.finishOutgoingSignal(
          conversation,
          row,
          row.messageId,
          message.createdAt,
        );
      }
    } finally {
      await source.close();
    }
  }

  private async uploadRemainingChunks(
    row: LocalAttachment,
    source: RandomAccessFile,
  ): Promise<void> {
    const status = await this.attachmentsApi.getStatus(row.attachmentId);
    const uploaded = new Set(status.uploadedChunks);
    for (let i = 0; i < row.chunkCount; i++) {
      if (uploaded.has(i)) continue;
      const len = plainChunkLength(
        row.plainSizeBytes,
        row.chunkSize,
        i,
        row.chunkCount,
      );
      const plaintext = await source.read(i * row.chunkSize, len);
      const ciphertext = encryptChunk({
        key: row.mediaKey,
        noncePrefix: row.noncePrefix,
        attachmentId: row.attachmentId,
        chunkIndex: i,
        chunkCount: row.chunkCount,
        plaintextSize: row.plainSizeBytes,
        plaintext,
      });
      await this.attachmentsApi.putChunk(row.attachmentId, i, ciphertext);
      uploaded.add(i);
      await this.attachmentStore.updateTransfer(row.attachmentId, {
        uploadedChunks: [...uploaded].sort((a, b) => a - b),
      });
    }
    await this.attachmentsApi.complete(row.attachmentId);
  }

  private async finishOutgoingSignal(
    conversation: Conversation,
    row: LocalAttachment,
    messageId: string,
    createdAt: number,
  ): Promise<void> {
    const descriptor: MediaPayload = {
      v: 1,
      t: "media",
      kind: row.kind,
      attachmentId: row.attachmentId,
      algorithm: MEDIA_ALGORITHM,
      size: row.plainSizeBytes,
      chunkSize: row.chunkSize,
      chunkCount: row.chunkCount,
      mimeType: row.mimeType,
      durationMs: row.durationMs,
      width: row.width,
      height: row.height,
      key: encodeMediaKey(row.mediaKey),
      noncePrefix: encodeNoncePrefix(row.noncePrefix),
    };
    await this.messageStore.updateStatus(messageId, "sending");
    const sent = await this.sendSignal(
      conversation,
      serializeMediaPayload(descriptor),
    );
    await this.messageStore.updateServerEnvelopeId(messageId, sent.envelopeId);
    await this.messageStore.updateStatus(messageId, "sent");
    await this.attachmentStore.updateTransfer(row.attachmentId, {
      transferState: "available",
      localUri: row.localUri ?? row.sourceUri,
    });
    await this.conversationStore.upsert({
      ...conversation,
      lastMessagePreview: mediaPreviewLabel(row.kind),
      lastMessageAt: createdAt,
    });
  }
}
