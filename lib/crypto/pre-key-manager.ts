import type { DevicesApi } from "@/lib/api/devices-api";
import type { UploadPreKeysRequest } from "@/lib/api/api-types";
import { bytesToBase64 } from "@/lib/crypto/encoding";
import type { ICryptoKeyStore } from "@/lib/db/crypto-key-store";
import type { IIdentityStore } from "@/lib/db/identity-store";

import type { ICryptoEngine } from "./libsignal-adapter";

const REPLENISH_COUNT = 50;

export class PreKeyManager {
  constructor(
    private readonly crypto: ICryptoEngine,
    private readonly cryptoKeyStore: ICryptoKeyStore,
    private readonly identityStore: IIdentityStore,
    private readonly devicesApi: DevicesApi,
  ) {}

  /**
   * Upload a fresh signed pre-key (new keyId) plus a batch of one-time pre-keys.
   * Always rotates the signed pre-key id so server unique (deviceId, keyId) is not hit.
   */
  async replenishOneTimePreKeys(): Promise<void> {
    const local = await this.identityStore.getLocalIdentity();
    if (!local) throw new Error("Local identity missing");

    const identityPrivate = await this.cryptoKeyStore.getIdentityPrivateKey();
    if (!identityPrivate) throw new Error("Identity private key missing");

    const identityPair = {
      publicKey: local.identityKeyPublic,
      privateKey: identityPrivate,
    };

    const nextSpkId = await this.cryptoKeyStore.getNextSignedPreKeyId();
    const signedPreKey = await this.crypto.generateSignedPreKey(
      identityPair,
      nextSpkId,
    );
    await this.cryptoKeyStore.saveSignedPreKey(signedPreKey);

    const startId = await this.cryptoKeyStore.getNextOtkKeyId();
    const oneTimePreKeys = await this.crypto.generatePreKeys(
      startId,
      REPLENISH_COUNT,
    );
    await this.cryptoKeyStore.saveOneTimePreKeys(oneTimePreKeys);
    await this.cryptoKeyStore.setNextOtkKeyId(startId + REPLENISH_COUNT);

    const body: UploadPreKeysRequest = {
      signedPreKey: {
        keyId: signedPreKey.keyId,
        publicKeyBase64: bytesToBase64(signedPreKey.publicKey),
        signatureBase64: bytesToBase64(signedPreKey.signature),
      },
      oneTimePreKeys: oneTimePreKeys.map((k) => ({
        keyId: k.keyId,
        publicKeyBase64: bytesToBase64(k.publicKey),
      })),
    };

    await this.devicesApi.uploadPreKeys(local.deviceId, body);
  }
}
