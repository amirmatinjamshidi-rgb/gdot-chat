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
import type { IOutboxStore } from "@/lib/db/outbox-store";
import type { IMediaBlobCache } from "@/lib/media/media-blob-cache";
import { OUTBOX_TTL_MS } from "@/lib/session/outbox-constants";
import type { Clock } from "@/lib/session/inbound/constants";
import { systemClock } from "@/lib/session/inbound/constants";
import type {
  Conversation,
  LocalAttachment,
  LocalMessage,
} from "@/lib/db/types";
import {
  createOutputFile as defaultCreateOutputFile,
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
import {
  cipherChunkByteLength,
  cipherChunkOffset,
  cipherFileSize,
  isAtRestUri,
  MEDIA_AT_REST_EXT,
} from "@/lib/media/media-at-rest";
import {
  packCipherChunks,
  unpackCipherChunks,
} from "@/lib/media/media-pack";
import type { MediaPlaybackVault } from "@/lib/media/media-playback-vault";
import { useMediaStore } from "@/stores/media-store";
export { packCipherChunks, unpackCipherChunks } from "@/lib/media/media-pack";

export type SendMediaInput = {
  conversationId: string;
  uri: string;
  kind: MediaKind;
  mimeType: string;
  durationMs?: number;
  width?: number;
  height?: number;
  /** When set, create a group-scoped attachment and send Signal payload via Sender Keys. */
  groupId?: string;
};

export type MediaFileAccess = {
  openExistingFile(uri: string): Promise<RandomAccessFile>;
  createOutputFile(
    attachmentId: string,
    extension: string,
    size: number,
  ): Promise<{ file: RandomAccessFile; uri: string }>;
};

export type MediaTransferExtras = {
  outboxStore?: IOutboxStore;
  mediaBlobCache?: IMediaBlobCache;
  clock?: Clock;
  /** Optional vault for persisting at-rest ciphertext / playback materialization. */
  mediaVault?: MediaPlaybackVault;
  /** Group fan-out for media Signal payload (Sender Keys). */
  sendGroupPlaintext?: (
    groupId: string,
    plaintext: string,
  ) => Promise<{ envelopeIds: string[] }>;
};

export class MediaTransferService {
  private readonly files: MediaFileAccess;
  private readonly outboxStore: IOutboxStore | null;
  private readonly mediaBlobCache: IMediaBlobCache | null;
  private readonly mediaVault: MediaPlaybackVault | null;
  private readonly clock: Clock;
  private sendGroupPlaintext:
    | ((groupId: string, plaintext: string) => Promise<{ envelopeIds: string[] }>)
    | null;

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
    extras?: MediaTransferExtras,
  ) {
    this.files = files ?? {
      openExistingFile: defaultOpenExistingFile,
      createOutputFile: defaultCreateOutputFile,
    };
    this.outboxStore = extras?.outboxStore ?? null;
    this.mediaBlobCache = extras?.mediaBlobCache ?? null;
    this.mediaVault = extras?.mediaVault ?? null;
    this.clock = extras?.clock ?? systemClock;
    this.sendGroupPlaintext = extras?.sendGroupPlaintext ?? null;
  }

  setGroupPlaintextSender(
    fn: ((groupId: string, plaintext: string) => Promise<{ envelopeIds: string[] }>) | null,
  ): void {
    this.sendGroupPlaintext = fn;
  }

  async sendOutgoingMedia(input: SendMediaInput): Promise<void> {
    let conversation = await this.conversationStore.getById(
      input.conversationId,
    );
    if (!conversation && input.groupId) {
      const localId = await this.identityStore.getLocalIdentity();
      conversation = {
        id: input.groupId,
        peerUserId: localId?.userId ?? "group",
        peerUsername: "group",
        peerDeviceId: localId?.deviceId ?? "local-device",
        lastMessagePreview: "",
        lastMessageAt: 0,
        unreadCount: 0,
      };
    }
    if (!conversation) throw new Error("Conversation not found");
    const local = await this.identityStore.getLocalIdentity();
    const source = await this.files.openExistingFile(input.uri);
    const size = source.size;
    if (size <= 0) throw new Error("Recording is empty");

    const key = generateMediaKey();
    const noncePrefix = generateNoncePrefix();
    const messageId = randomUUID();
    const clientId = randomUUID();
    const createdAt = this.clock();
    const tempId = `local-${randomUUID()}`;

    const message: LocalMessage = {
      id: messageId,
      clientId,
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
        ...(input.groupId ? { groupId: input.groupId } : {}),
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
        groupId: input.groupId,
        atRestEncrypted: false,
        transferState: "uploading",
        uploadedChunks: [],
        downloadedChunks: [],
        createdAt,
        updatedAt: Date.now(),
      };
      await this.attachmentStore.upsert(row);
      await this.messageStore.updateAttachmentId(messageId, created.attachmentId);
      await this.attachmentStore.delete(tempId);

      const encryptedBlob = await this.uploadRemainingChunks(row, source);
      // Encrypt durable copy + delete plaintext source as soon as chunks exist.
      const atRestRow = await this.persistOutgoingAtRest(row, encryptedBlob);
      await this.finishOutgoingSignal(
        conversation,
        atRestRow,
        messageId,
        clientId,
        createdAt,
        encryptedBlob,
        input.groupId,
      );
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
    senderUserId?: string;
    serverEnvelopeId: string;
    createdAt: number;
    messageType: 2 | 3 | 4;
  }): Promise<void> {
    const existing = await this.messageStore.getByServerEnvelopeId(
      params.serverEnvelopeId,
    );
    if (existing) return;

    if (params.payload.clientMessageId) {
      const byClient = await this.messageStore.getByClientId(
        params.payload.clientMessageId,
      );
      if (byClient) return;
    }

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
      clientId: params.payload.clientMessageId ?? randomUUID(),
      conversationId: params.conversation.id,
      direction: "incoming",
      kind: params.payload.kind,
      plaintext: "",
      messageType: params.messageType,
      status: transferState === "failed" ? "download_failed" : "delivered",
      senderDeviceId: params.senderDeviceId,
      senderUserId: params.senderUserId,
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
    if (row.transferState === "available" && row.localUri && row.atRestEncrypted) {
      return;
    }

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
    const cipherSize = cipherFileSize(
      row.plainSizeBytes,
      row.chunkSize,
      row.chunkCount,
    );
    // Durable file stores wire ciphertext (not plaintext) under Documents/gdot-media.
    const dest =
      row.localUri && row.atRestEncrypted
        ? { file: await this.files.openExistingFile(row.localUri), uri: row.localUri }
        : await this.files.createOutputFile(
            attachmentId,
            MEDIA_AT_REST_EXT,
            cipherSize,
          );

    try {
      for (let i = 0; i < row.chunkCount; i++) {
        if (downloaded.has(i)) continue;
        const ciphertext = await this.attachmentsApi.getChunk(attachmentId, i);
        // Authenticate chunk before writing durable ciphertext.
        decryptChunk({
          key: row.mediaKey,
          noncePrefix: row.noncePrefix,
          attachmentId,
          chunkIndex: i,
          chunkCount: row.chunkCount,
          plaintextSize: row.plainSizeBytes,
          ciphertext,
        });
        const off = cipherChunkOffset(
          row.plainSizeBytes,
          row.chunkSize,
          row.chunkCount,
          i,
        );
        const expectLen = cipherChunkByteLength(
          row.plainSizeBytes,
          row.chunkSize,
          row.chunkCount,
          i,
        );
        if (ciphertext.byteLength !== expectLen) {
          throw new Error("Unexpected ciphertext chunk length");
        }
        await dest.file.write(off, ciphertext);
        downloaded.add(i);
        await this.attachmentStore.updateTransfer(attachmentId, {
          downloadedChunks: [...downloaded].sort((a, b) => a - b),
          localUri: dest.uri,
        });
      }
      await dest.file.close();
      await this.attachmentsApi.downloadComplete(attachmentId);
      const current = await this.attachmentStore.get(attachmentId);
      if (current) {
        await this.attachmentStore.upsert({
          ...current,
          transferState: "available",
          localUri: dest.uri,
          atRestEncrypted: true,
          downloadedChunks: [...downloaded].sort((a, b) => a - b),
          updatedAt: Date.now(),
        });
      }
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
    const message = await this.messageStore.getById(row.messageId);
    const conversationId = message?.conversationId ?? "";
    let conversation = await this.conversationStore.getById(conversationId);
    const groupId = row.groupId;
    if (!conversation && groupId) {
      const localId = await this.identityStore.getLocalIdentity();
      conversation = {
        id: groupId,
        peerUserId: localId?.userId ?? "group",
        peerUsername: `group:${groupId.slice(0, 8)}`,
        peerDeviceId: localId?.deviceId ?? "group",
        lastMessagePreview: "",
        lastMessageAt: 0,
        unreadCount: 0,
      };
    }
    if (!conversation) return;

    // Prefer durable .genc (no plaintext on disk) when at-rest already persisted.
    let encryptedBlob: Uint8Array | null = null;
    let working = row;
    if (
      row.atRestEncrypted &&
      row.localUri &&
      isAtRestUri(row.localUri) &&
      this.mediaVault
    ) {
      encryptedBlob = await this.uploadRemainingFromDurableCipher(row);
    } else if (row.sourceUri) {
      const source = await this.files.openExistingFile(row.sourceUri);
      try {
        encryptedBlob = await this.uploadRemainingChunks(row, source);
        working = await this.persistOutgoingAtRest(row, encryptedBlob);
      } finally {
        await source.close();
      }
    } else {
      return;
    }

    if (message && !message.serverEnvelopeId) {
      await this.finishOutgoingSignal(
        conversation,
        working,
        row.messageId,
        message.clientId,
        message.createdAt,
        encryptedBlob,
        groupId,
      );
    } else if (encryptedBlob.byteLength > 0 && this.mediaBlobCache && message) {
      await this.mediaBlobCache.put(
        message.clientId,
        encryptedBlob,
        this.clock(),
      );
    }
  }

  /** Upload missing chunks from packed at-rest ciphertext (no plaintext source). */
  private async uploadRemainingFromDurableCipher(
    row: LocalAttachment,
  ): Promise<Uint8Array> {
    if (!this.mediaVault || !row.localUri) {
      throw new Error("Durable ciphertext unavailable for resume");
    }
    const packed = await this.mediaVault.readDurablePacked(row.localUri);
    const chunks = unpackCipherChunks(packed, row.chunkCount);
    const status = await this.attachmentsApi.getStatus(row.attachmentId);
    const uploaded = new Set(status.uploadedChunks);
    for (let i = 0; i < row.chunkCount; i++) {
      const ciphertext = chunks[i]!;
      if (!uploaded.has(i)) {
        await this.attachmentsApi.putChunk(row.attachmentId, i, ciphertext);
        uploaded.add(i);
        await this.attachmentStore.updateTransfer(row.attachmentId, {
          uploadedChunks: [...uploaded].sort((a, b) => a - b),
        });
      }
    }
    await this.attachmentsApi.complete(row.attachmentId);
    return packed;
  }

  /**
   * Persist packed wire ciphertext under gdot-media, scrub plaintext sourceUri,
   * and mark the attachment at-rest. Safe to call more than once.
   */
  private async persistOutgoingAtRest(
    row: LocalAttachment,
    encryptedBlob: Uint8Array,
  ): Promise<LocalAttachment> {
    if (encryptedBlob.byteLength === 0 || !this.mediaVault) {
      return row;
    }
    if (row.atRestEncrypted && row.localUri && isAtRestUri(row.localUri)) {
      await this.mediaVault.scrubPlaintextSource(row.sourceUri, row.localUri);
      if (row.sourceUri) {
        const cleared = { ...row, sourceUri: undefined, updatedAt: Date.now() };
        await this.attachmentStore.upsert(cleared);
        return cleared;
      }
      return row;
    }

    const durableUri = await this.mediaVault.persistPackedCipher(
      row.attachmentId,
      encryptedBlob,
    );
    await this.mediaVault.scrubPlaintextSource(row.sourceUri, durableUri);
    const next: LocalAttachment = {
      ...row,
      localUri: durableUri,
      sourceUri: undefined,
      atRestEncrypted: true,
      updatedAt: Date.now(),
    };
    await this.attachmentStore.upsert(next);
    return next;
  }

  private async uploadRemainingChunks(
    row: LocalAttachment,
    source: RandomAccessFile,
  ): Promise<Uint8Array> {
    const status = await this.attachmentsApi.getStatus(row.attachmentId);
    const uploaded = new Set(status.uploadedChunks);
    const cipherChunks: Uint8Array[] = [];
    for (let i = 0; i < row.chunkCount; i++) {
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
      cipherChunks.push(ciphertext);
      if (!uploaded.has(i)) {
        await this.attachmentsApi.putChunk(row.attachmentId, i, ciphertext);
        uploaded.add(i);
        await this.attachmentStore.updateTransfer(row.attachmentId, {
          uploadedChunks: [...uploaded].sort((a, b) => a - b),
        });
      }
    }
    await this.attachmentsApi.complete(row.attachmentId);
    return packCipherChunks(cipherChunks);
  }

  private async finishOutgoingSignal(
    conversation: Conversation,
    row: LocalAttachment,
    messageId: string,
    clientMessageId: string,
    createdAt: number,
    encryptedBlob: Uint8Array,
    groupId?: string,
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
      clientMessageId,
    };
    await this.messageStore.updateStatus(messageId, "sending");
    const plaintext = serializeMediaPayload(descriptor);
    // Persist .genc + scrub plaintext source before Signal post so a failed
    // send / crash never leaves queued outgoing media as plaintext on disk.
    const atRestRow = await this.persistOutgoingAtRest(row, encryptedBlob);
    let envelopeId: string;
    if (groupId) {
      if (!this.sendGroupPlaintext) {
        throw new Error("Group media sender is not configured");
      }
      const result = await this.sendGroupPlaintext(groupId, plaintext);
      envelopeId = result.envelopeIds[0] ?? clientMessageId;
    } else {
      const sent = await this.sendSignal(conversation, plaintext);
      envelopeId = sent.envelopeId;
    }

    await this.messageStore.updateServerEnvelopeId(messageId, envelopeId);
    await this.messageStore.updateStatus(messageId, "sent");

    const durableUri = atRestRow.localUri ?? atRestRow.sourceUri;
    const current = await this.attachmentStore.get(row.attachmentId);
    if (current) {
      await this.attachmentStore.upsert({
        ...current,
        ...atRestRow,
        transferState: "available",
        localUri: durableUri,
        groupId: groupId ?? current.groupId ?? atRestRow.groupId,
        atRestEncrypted: atRestRow.atRestEncrypted ?? current.atRestEncrypted,
        sourceUri: undefined,
        updatedAt: Date.now(),
      });
    } else {
      await this.attachmentStore.updateTransfer(row.attachmentId, {
        transferState: "available",
        localUri: durableUri,
      });
    }
    if (!groupId) {
      await this.conversationStore.upsert({
        ...conversation,
        lastMessagePreview: mediaPreviewLabel(row.kind),
        lastMessageAt: createdAt,
      });
    }

    let blobCached = false;
    if (this.mediaBlobCache && encryptedBlob.byteLength > 0) {
      const result = await this.mediaBlobCache.put(
        clientMessageId,
        encryptedBlob,
        this.clock(),
      );
      blobCached = result === "stored";
    }
    if (this.outboxStore) {
      await this.outboxStore.upsertPending({
        clientMessageId,
        localMessageId: messageId,
        conversationId: groupId ?? conversation.id,
        peerUserId: groupId ? "group" : conversation.peerUserId,
        peerDeviceId: groupId ? "group" : conversation.peerDeviceId,
        plaintext,
        payloadKind: "media",
        mediaAttachmentId: row.attachmentId,
        mediaBlobCached: blobCached,
        groupId,
        createdAt,
        expiresAt: createdAt + OUTBOX_TTL_MS,
      });
    }
  }

  /**
   * Full media resend path: decrypt cached ciphertext under the old attachment id,
   * create a new server attachment, re-encrypt under the new id, upload, return
   * an updated descriptor (same media key / nonce).
   */
  async reuploadFromCachedCiphertext(params: {
    conversation: Conversation;
    clientMessageId: string;
    descriptor: MediaPayload;
    ciphertext: Uint8Array;
  }): Promise<MediaPayload> {
    const { conversation, descriptor, ciphertext } = params;
    const key = base64UrlToBytes(descriptor.key);
    const noncePrefix = base64UrlToBytes(descriptor.noncePrefix);
    const chunks = unpackCipherChunks(ciphertext, descriptor.chunkCount);

    const created = await this.attachmentsApi.create({
      recipientUserId: conversation.peerUserId,
      recipientDeviceId: conversation.peerDeviceId,
      sizeBytes: descriptor.size,
    });

    for (let i = 0; i < descriptor.chunkCount; i++) {
      const oldCipher = chunks[i]!;
      const plain = decryptChunk({
        key,
        noncePrefix,
        attachmentId: descriptor.attachmentId,
        chunkIndex: i,
        chunkCount: descriptor.chunkCount,
        plaintextSize: descriptor.size,
        ciphertext: oldCipher,
      });
      const newCipher = encryptChunk({
        key,
        noncePrefix,
        attachmentId: created.attachmentId,
        chunkIndex: i,
        chunkCount: created.chunkCount,
        plaintextSize: descriptor.size,
        plaintext: plain,
      });
      await this.attachmentsApi.putChunk(created.attachmentId, i, newCipher);
    }
    await this.attachmentsApi.complete(created.attachmentId);

    return {
      ...descriptor,
      attachmentId: created.attachmentId,
      chunkSize: created.chunkSizeBytes,
      chunkCount: created.chunkCount,
      clientMessageId: params.clientMessageId,
    };
  }

  async attachmentExists(attachmentId: string): Promise<boolean> {
    try {
      await this.attachmentsApi.getStatus(attachmentId);
      return true;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 410)) {
        return false;
      }
      throw e;
    }
  }
}

