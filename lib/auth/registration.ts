import type { AuthResult, RegisterRequest } from "@/lib/api/api-types";
import { bytesToBase64 } from "@/lib/crypto/encoding";
import type { LibSignalAdapter } from "@/lib/crypto/libsignal-adapter";
import type { AuthApi } from "@/lib/api/auth-api";
import type { LocalIdentity } from "@/lib/db/types";
import type { IIdentityStore } from "@/lib/db/identity-store";
import type { IKekManager } from "@/lib/db/kek-manager";
import type { IDatabase } from "@/lib/db/database-types";
import type { AuthStore } from "@/lib/session/auth-store";
import { ApiError } from "@/lib/api/api-client";
import { randomUUID } from "@/lib/crypto/random-id";

export async function registerUser(params: {
  username: string;
  password: string;
  deviceName: string;
  authApi: AuthApi;
  crypto: LibSignalAdapter;
  authStore: AuthStore;
  kekManager: IKekManager;
  db: IDatabase;
  identityStore: IIdentityStore;
}): Promise<void> {
  const username = params.username.trim().toLowerCase();
  const identityPair = await params.crypto.generateIdentityKeyPair();
  const registrationId = await params.crypto.generateRegistrationId();
  const signedPreKey = await params.crypto.generateSignedPreKey(
    identityPair,
    1,
  );
  const oneTimePreKeys = await params.crypto.generatePreKeys(1, 100);

  const registerBody: RegisterRequest = {
    username,
    password: params.password,
    device: {
      deviceName: params.deviceName,
      registrationId,
      identityKeyPublicBase64: bytesToBase64(identityPair.publicKey),
      signedPreKey: {
        keyId: signedPreKey.keyId,
        publicKeyBase64: bytesToBase64(signedPreKey.publicKey),
        signatureBase64: bytesToBase64(signedPreKey.signature),
      },
      oneTimePreKeys: oneTimePreKeys.map((k) => ({
        keyId: k.keyId,
        publicKeyBase64: bytesToBase64(k.publicKey),
      })),
    },
  };

  let auth: AuthResult;
  try {
    auth = await params.authApi.register(registerBody);
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
      throw e;
    }
    auth = offlineAuthResult(username);
  }

  if (!(await params.kekManager.hasKek())) {
    await params.kekManager.createKekAfterBiometric();
  }
  const passphrase = await params.kekManager.getPassphraseForDb();
  if (!params.db.isOpen()) {
    await params.db.open(passphrase);
  }

  const localIdentity: LocalIdentity = {
    userId: auth.userId,
    deviceId: auth.deviceId,
    username,
    registrationId,
    identityKeyPublic: identityPair.publicKey,
  };
  await params.identityStore.saveLocalIdentity(localIdentity);
  await params.authStore.setTokens(auth);
}

function offlineAuthResult(username: string): AuthResult {
  const userId = randomUUID();
  const deviceId = randomUUID();
  return {
    accessToken: `offline.${userId}`,
    refreshToken: `offline.refresh.${userId}`,
    userId,
    deviceId,
    accessTokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
}

export async function loginUser(params: {
  username: string;
  password: string;
  authApi: AuthApi;
  authStore: AuthStore;
  kekManager: IKekManager;
  db: IDatabase;
  identityStore: IIdentityStore;
}): Promise<void> {
  const username = params.username.trim().toLowerCase();
  const passphrase = await params.kekManager.getPassphraseForDb();
  if (!params.db.isOpen()) {
    await params.db.open(passphrase);
  }

  const local = await params.identityStore.getLocalIdentity();

  let auth: AuthResult;
  try {
    const deviceId =
      (await params.authStore.getDeviceId()) ?? local?.deviceId ?? randomUUID();
    auth = await params.authApi.login({
      username,
      password: params.password,
      deviceId,
    });
  } catch {
    if (!local || local.username !== username) {
      throw new Error("Invalid credentials or no local account");
    }
    auth = {
      accessToken: `offline.${local.userId}`,
      refreshToken: `offline.refresh.${local.userId}`,
      userId: local.userId,
      deviceId: local.deviceId,
      accessTokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
  }
  await params.authStore.setTokens(auth);
}
