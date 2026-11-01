import type { AuthResult, RegisterRequest } from "@/lib/api/api-types";
import { ApiError } from "@/lib/api/api-client";
import type { AuthApi } from "@/lib/api/auth-api";
import { AppAuthError } from "@/lib/auth/app-auth-error";
import { getBiometricCapability } from "@/lib/auth/biometric-capability";
import { bytesToBase64 } from "@/lib/crypto/encoding";
import type { LibSignalAdapter } from "@/lib/crypto/libsignal-adapter";
import type { ICryptoKeyStore } from "@/lib/db/crypto-key-store";
import { clearLegacyAsyncStorage } from "@/lib/db/clear-legacy-storage";
import type { IDatabase } from "@/lib/db/database-types";
import type { IIdentityStore } from "@/lib/db/identity-store";
import type { IKekManager } from "@/lib/db/kek-manager";
import type { LocalIdentity } from "@/lib/db/types";
import { randomUUID } from "@/lib/crypto/random-id";
import type { AuthStore } from "@/lib/session/auth-store";

export async function ensureKek(
  kekManager: IKekManager,
  appPin?: string,
): Promise<void> {
  if (await kekManager.hasKek()) return;

  const capability = await getBiometricCapability();
  if (capability.canUseStrongForSecureStore) {
    await kekManager.createKekAfterBiometric();
    return;
  }

  if (!appPin) throw new AppAuthError("PIN_REQUIRED");
  await kekManager.createKekWithPin(appPin);
}

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
  cryptoKeyStore: ICryptoKeyStore;
  appPin?: string;
}): Promise<void> {
  // Resolve KEK path before server registration so PIN_REQUIRED does not leave
  // a half-created server account.
  await ensureKek(params.kekManager, params.appPin);

  const username = params.username.trim().toLowerCase();
  const identityPair = await params.crypto.generateIdentityKeyPair();
  const registrationId = await params.crypto.generateRegistrationId();
  const signedPreKey = await params.crypto.generateSignedPreKey(
    identityPair,
    1,
  );
  const oneTimePreKeys = await params.crypto.generatePreKeys(1, 50);

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
    if (e instanceof ApiError) throw e;
    throw e instanceof Error
      ? e
      : new Error("Registration failed. Check your connection and try again.");
  }

  const passphrase = await params.kekManager.getPassphraseForDb({
    pin: params.appPin,
  });
  if (!params.db.isOpen()) {
    await params.db.open(passphrase);
  }
  await clearLegacyAsyncStorage();

  const localIdentity: LocalIdentity = {
    userId: auth.userId,
    deviceId: auth.deviceId,
    username,
    registrationId,
    identityKeyPublic: identityPair.publicKey,
  };
  await params.identityStore.saveLocalIdentity(localIdentity);
  await params.cryptoKeyStore.saveIdentityPrivateKey(identityPair.privateKey);
  await params.cryptoKeyStore.saveSignedPreKey(signedPreKey);
  await params.cryptoKeyStore.saveOneTimePreKeys(oneTimePreKeys);
  await params.cryptoKeyStore.setNextOtkKeyId(
    oneTimePreKeys[oneTimePreKeys.length - 1]!.keyId + 1,
  );
  await params.authStore.setTokens(auth);
  // Close so /lock re-authenticates (biometric or PIN) before app use.
  if (params.db.isOpen()) {
    await params.db.close();
  }
}


export async function loginUser(params: {
  username: string;
  password: string;
  authApi: AuthApi;
  authStore: AuthStore;
  kekManager: IKekManager;
  db: IDatabase;
  identityStore: IIdentityStore;
  appPin?: string;
}): Promise<void> {
  const username = params.username.trim().toLowerCase();
  const mode = await params.kekManager.getLockMode();
  if (mode === "pin" && !params.appPin) {
    throw new AppAuthError("PIN_REQUIRED");
  }

  const passphrase = await params.kekManager.getPassphraseForDb({
    pin: params.appPin,
  });
  if (!params.db.isOpen()) {
    await params.db.open(passphrase);
  }
  await clearLegacyAsyncStorage();

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
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw e instanceof Error
      ? e
      : new Error("Login failed. Check your connection and try again.");
  }
  await params.authStore.setTokens(auth);
  if (params.db.isOpen()) {
    await params.db.close();
  }
}
