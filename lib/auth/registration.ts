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
import type { AuthStore } from "@/lib/session/auth-store";

export async function ensureKek(
  kekManager: IKekManager,
  appPin?: string,
): Promise<void> {
  if (await kekManager.hasKek()) return;

  const capability = await getBiometricCapability();
  if (capability.canUseStrongForSecureStore) {
    try {
      await kekManager.createKekAfterBiometric();
      return;
    } catch (e) {
      // Hardware/capability can race with enrollment (or SecureStore can lie).
      // Fall through to the app-PIN path so register/login can route to set-app-pin.
      // Duck-type `code` — `instanceof AppAuthError` can fail across Metro/Hermes copies.
      const code =
        e instanceof AppAuthError
          ? e.code
          : e && typeof e === "object" && "code" in e
            ? String((e as { code: unknown }).code)
            : null;
      if (code !== "NOT_ENROLLED" && code !== "STRONG_BIOMETRIC_REQUIRED") {
        throw e;
      }
    }
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
  const hadKek = await params.kekManager.hasKek();
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
  // New KEK cannot open an orphan SQLCipher file from a previous install.
  if (!hadKek) {
    await params.db.deleteDatabase();
  }
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
  deviceName?: string;
  authApi: AuthApi;
  crypto: LibSignalAdapter;
  authStore: AuthStore;
  kekManager: IKekManager;
  db: IDatabase;
  identityStore: IIdentityStore;
  cryptoKeyStore: ICryptoKeyStore;
  appPin?: string;
}): Promise<void> {
  const username = params.username.trim().toLowerCase();
  const hadKek = await params.kekManager.hasKek();
  if (!hadKek) {
    // First lock on this device (reinstall / new device): biometric or PIN.
    await ensureKek(params.kekManager, params.appPin);
  } else {
    const mode = await params.kekManager.getLockMode();
    if (mode === "pin" && !params.appPin) {
      throw new AppAuthError("PIN_REQUIRED");
    }
  }

  const passphrase = await params.kekManager.getPassphraseForDb({
    pin: params.appPin,
  });
  // Creating a fresh KEK cannot decrypt a leftover DB from a wiped SecureStore.
  if (!hadKek) {
    await params.db.deleteDatabase();
  }
  if (!params.db.isOpen()) {
    await params.db.open(passphrase);
  }
  await clearLegacyAsyncStorage();

  const local = await params.identityStore.getLocalIdentity();

  let auth: AuthResult;
  try {
    if (local) {
      const deviceId =
        (await params.authStore.getDeviceId()) ?? local.deviceId;
      auth = await params.authApi.login({
        username,
        password: params.password,
        deviceId,
      });
    } else {
      // No local identity: register this install as a new device (password fallback).
      const deviceName = params.deviceName?.trim() || "Mobile";
      const identityPair = await params.crypto.generateIdentityKeyPair();
      const registrationId = await params.crypto.generateRegistrationId();
      const signedPreKey = await params.crypto.generateSignedPreKey(
        identityPair,
        1,
      );
      const oneTimePreKeys = await params.crypto.generatePreKeys(1, 50);

      auth = await params.authApi.loginNewDevice({
        username,
        password: params.password,
        device: {
          deviceName,
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
      });

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
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof AppAuthError) throw e;
    throw e instanceof Error
      ? e
      : new Error("Login failed. Check your connection and try again.");
  }
  await params.authStore.setTokens(auth);
  if (params.db.isOpen()) {
    await params.db.close();
  }
}
