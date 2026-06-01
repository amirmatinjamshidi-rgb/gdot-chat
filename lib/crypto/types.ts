export interface IdentityKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface SignedPreKey {
  keyId: number;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  signature: Uint8Array;
}

export interface PreKey {
  keyId: number;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface SessionRecord {
  peerDeviceId: string;
  serialized: Uint8Array;
}

export interface CiphertextResult {
  ciphertext: Uint8Array;
  messageType: 2 | 3;
  updatedSession: Uint8Array;
}

export interface SendPayload {
  recipientUserId: string;
  recipientDeviceId: string;
  messageType: 2 | 3;
  ciphertextBase64: string;
}

export interface LocalIdentity {
  userId: string;
  deviceId: string;
  registrationId: number;
  identityKeyPublic: Uint8Array;
}

export interface RemoteIdentity {
  peerUserId: string;
  peerDeviceId: string;
  identityKeyPublic: Uint8Array;
  safetyNumber: string;
  verified: boolean;
  lastSeenKeyFingerprint: string;
}
