export type MessageStatus =
  | "pending"
  | "uploading"
  | "sending"
  | "sent"
  | "delivered"
  | "failed"
  | "downloading"
  | "available"
  | "download_failed";
export type MessageDirection = "incoming" | "outgoing";
export type LocalMessageKind = "text" | "voice" | "video";
export type AttachmentTransferState =
  | "pending"
  | "uploading"
  | "ready"
  | "downloading"
  | "available"
  | "failed";

export interface LocalMessage {
  id: string;
  clientId: string;
  conversationId: string;
  direction: MessageDirection;
  kind: LocalMessageKind;
  plaintext: string;
  ciphertext?: Uint8Array;
  messageType?: 2 | 3 | 4;
  status: MessageStatus;
  senderDeviceId: string;
  senderUserId?: string;
  createdAt: number;
  serverEnvelopeId?: string;
  attachmentId?: string;
}

export interface LocalAttachment {
  attachmentId: string;
  messageId: string;
  kind: "voice" | "video";
  mimeType: string;
  plainSizeBytes: number;
  durationMs?: number;
  width?: number;
  height?: number;
  chunkSize: number;
  chunkCount: number;
  mediaKey: Uint8Array;
  noncePrefix: Uint8Array;
  localUri?: string;
  sourceUri?: string;
  /** Set for group-scoped attachments (Sender Keys send path). */
  groupId?: string;
  /**
   * Durable local file is packed wire ciphertext (.genc) under gdot-media.
   * Plaintext playback lives only in an ephemeral cache wiped on lock.
   */
  atRestEncrypted?: boolean;
  /** Ephemeral plaintext playback URI; never persisted to SQLCipher. */
  playbackUri?: string;
  transferState: AttachmentTransferState;
  uploadedChunks: number[];
  downloadedChunks: number[];
  createdAt: number;
  updatedAt: number;
}

export interface Conversation {
  id: string;
  peerUserId: string;
  peerUsername: string;
  peerDeviceId: string;
  lastMessagePreview: string;
  lastMessageAt: number;
  unreadCount: number;
}

export interface LocalIdentity {
  userId: string;
  deviceId: string;
  username: string;
  registrationId: number;
  identityKeyPublic: Uint8Array;
  createdAt?: number;
}

export interface RemoteIdentity {
  peerUserId: string;
  peerDeviceId: string;
  identityKeyPublic: Uint8Array;
  safetyNumber: string;
  verified: boolean;
  /** True after a peer identity key change until the user accepts the new key. */
  keyChanged: boolean;
  lastSeenKeyFingerprint: string;
}