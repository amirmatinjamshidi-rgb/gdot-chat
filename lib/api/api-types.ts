export interface RegisterDevicePayload {
  deviceName: string;
  registrationId: number;
  identityKeyPublicBase64: string;
  signedPreKey: {
    keyId: number;
    publicKeyBase64: string;
    signatureBase64: string;
  };
  oneTimePreKeys: { keyId: number; publicKeyBase64: string }[];
}

export interface RegisterRequest {
  username: string;
  password: string;
  device: RegisterDevicePayload;
}

export interface LoginRequest {
  username: string;
  password: string;
  deviceId: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  userId: string;
  deviceId: string;
  accessTokenExpiresAt: string;
}

export interface UserSummaryDto {
  id: string;
  username: string;
}

export interface DeviceSummaryDto {
  deviceId: string;
  name: string;
  registrationId: number;
}

export interface UploadPreKeysRequest {
  signedPreKey: {
    keyId: number;
    publicKeyBase64: string;
    signatureBase64: string;
  };
  oneTimePreKeys: { keyId: number; publicKeyBase64: string }[];
}

export interface PreKeyBundleDto {
  userId: string;
  deviceId: string;
  registrationId: number;
  identityKeyPublicBase64: string;
  signedPreKey: {
    keyId: number;
    publicKeyBase64: string;
    signatureBase64: string;
  };
  oneTimePreKey: { keyId: number; publicKeyBase64: string } | null;
}

export interface SendMessageRequest {
  recipientUserId: string;
  recipientDeviceId: string;
  messageType: number;
  ciphertextBase64: string;
}

export interface MessageEnvelopeDto {
  id: string;
  senderDeviceId: string;
  messageType: number;
  ciphertextBase64: string;
  createdAt: string;
}
