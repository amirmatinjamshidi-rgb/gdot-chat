export type MessageStatus = "pending" | "sent" | "delivered" | "failed";
export type MessageDirection = "incoming" | "outgoing";

export interface LocalMessage {
  id: string;
  clientId: string;
  conversationId: string;
  direction: MessageDirection;
  plaintext: string;
  ciphertext?: Uint8Array;
  messageType?: 2 | 3;
  status: MessageStatus;
  senderDeviceId: string;
  createdAt: number;
  serverEnvelopeId?: string;
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
  lastSeenKeyFingerprint: string;
}
