import {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  FingerprintGenerator,
  type DeviceType,
} from "@privacyresearch/libsignal-protocol-typescript";

import type { PreKeyBundleDto } from "@/lib/api/api-types";
import type { ICryptoKeyStore } from "@/lib/db/crypto-key-store";
import type { IIdentityStore } from "@/lib/db/identity-store";
import type { ISessionStore } from "@/lib/db/session-store";

import { base64ToBytes, bytesToBase64 } from "./encoding";
import {
  arrayBufferToBytes,
  arrayBufferToUtf8,
  bytesToArrayBuffer,
  utf8ToArrayBuffer,
} from "./buffer-utils";
import { ensureSignalInitialized } from "./init-signal";
import { SignalProtocolStore } from "./signal-protocol-store";
import type { IdentityKeyPair, PreKey, SignedPreKey } from "./types";

const DEVICE_ID = 1;

function addressFor(peerId: string): SignalProtocolAddress {
  return new SignalProtocolAddress(peerId, DEVICE_ID);
}

function bundleToDevice(bundle: PreKeyBundleDto): DeviceType {
  return {
    identityKey: bytesToArrayBuffer(base64ToBytes(bundle.identityKeyPublicBase64)),
    registrationId: bundle.registrationId,
    signedPreKey: {
      keyId: bundle.signedPreKey.keyId,
      publicKey: bytesToArrayBuffer(
        base64ToBytes(bundle.signedPreKey.publicKeyBase64),
      ),
      signature: bytesToArrayBuffer(
        base64ToBytes(bundle.signedPreKey.signatureBase64),
      ),
    },
    preKey: bundle.oneTimePreKey
      ? {
          keyId: bundle.oneTimePreKey.keyId,
          publicKey: bytesToArrayBuffer(
            base64ToBytes(bundle.oneTimePreKey.publicKeyBase64),
          ),
        }
      : undefined,
  };
}

function keyPairToIdentity(pair: {
  pubKey: ArrayBuffer;
  privKey: ArrayBuffer;
}): IdentityKeyPair {
  return {
    publicKey: arrayBufferToBytes(pair.pubKey),
    privateKey: arrayBufferToBytes(pair.privKey),
  };
}

export class SignalEngine {
  private store: SignalProtocolStore | null = null;

  constructor(
    private readonly identityStore: IIdentityStore,
    private readonly cryptoKeyStore: ICryptoKeyStore,
    private readonly sessionStore: ISessionStore,
  ) {}

  private getProtocolStore(): SignalProtocolStore {
    if (!this.store) {
      this.store = new SignalProtocolStore(
        this.identityStore,
        this.cryptoKeyStore,
        this.sessionStore,
      );
    }
    return this.store;
  }

  async generateIdentityKeyPair(): Promise<IdentityKeyPair> {
    await ensureSignalInitialized();
    const pair = await KeyHelper.generateIdentityKeyPair();
    return keyPairToIdentity(pair);
  }

  async generateRegistrationId(): Promise<number> {
    await ensureSignalInitialized();
    return KeyHelper.generateRegistrationId();
  }

  async generateSignedPreKey(
    identity: IdentityKeyPair,
    keyId: number,
  ): Promise<SignedPreKey> {
    await ensureSignalInitialized();
    const pair = {
      pubKey: bytesToArrayBuffer(identity.publicKey),
      privKey: bytesToArrayBuffer(identity.privateKey),
    };
    const spk = await KeyHelper.generateSignedPreKey(pair, keyId);
    return {
      keyId: spk.keyId,
      publicKey: arrayBufferToBytes(spk.keyPair.pubKey),
      privateKey: arrayBufferToBytes(spk.keyPair.privKey),
      signature: arrayBufferToBytes(spk.signature),
    };
  }

  async generatePreKeys(startId: number, count: number): Promise<PreKey[]> {
    await ensureSignalInitialized();
    const keys: PreKey[] = [];
    for (let i = 0; i < count; i++) {
      const pk = await KeyHelper.generatePreKey(startId + i);
      keys.push({
        keyId: pk.keyId,
        publicKey: arrayBufferToBytes(pk.keyPair.pubKey),
        privateKey: arrayBufferToBytes(pk.keyPair.privKey),
      });
    }
    return keys;
  }

  async ensureSession(
    peerAddressId: string,
    bundle: PreKeyBundleDto,
  ): Promise<void> {
    await ensureSignalInitialized();
    const store = this.getProtocolStore();
    const address = addressFor(peerAddressId);
    const session = await store.loadSession(address.toString());
    if (session) return;

    const builder = new SessionBuilder(store, address);
    await builder.processPreKey(bundleToDevice(bundle));
  }

  async encrypt(
    peerAddressId: string,
    plaintext: string,
  ): Promise<{ ciphertext: Uint8Array; messageType: 2 | 3 }> {
    await ensureSignalInitialized();
    const store = this.getProtocolStore();
    const cipher = new SessionCipher(store, addressFor(peerAddressId));
    const result = await cipher.encrypt(utf8ToArrayBuffer(plaintext));
    const rawBody = result.body as ArrayBuffer | string | undefined;
    const body =
      rawBody instanceof ArrayBuffer
        ? arrayBufferToBytes(rawBody)
        : typeof rawBody === "string"
          ? new Uint8Array(new TextEncoder().encode(rawBody))
          : new Uint8Array(0);
    return {
      ciphertext: body,
      messageType: result.type as 2 | 3,
    };
  }

  async decrypt(
    peerAddressId: string,
    messageType: 2 | 3,
    ciphertext: Uint8Array,
  ): Promise<string> {
    await ensureSignalInitialized();
    const store = this.getProtocolStore();
    const cipher = new SessionCipher(store, addressFor(peerAddressId));
    const buf = bytesToArrayBuffer(ciphertext);
    let plaintext: ArrayBuffer;
    if (messageType === 3) {
      plaintext = await cipher.decryptPreKeyWhisperMessage(buf, "binary");
    } else {
      plaintext = await cipher.decryptWhisperMessage(buf, "binary");
    }
    return arrayBufferToUtf8(plaintext);
  }

  async computeSafetyNumber(
    localPublic: Uint8Array,
    remotePublic: Uint8Array,
  ): Promise<string> {
    await ensureSignalInitialized();
    const local = await this.identityStore.getLocalIdentity();
    const gen = new FingerprintGenerator(5200);
    return gen.createFor(
      local?.userId ?? "local",
      bytesToArrayBuffer(localPublic),
      "peer",
      bytesToArrayBuffer(remotePublic),
    );
  }
}
