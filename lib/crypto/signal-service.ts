import type { DevicesApi } from "@/lib/api/devices-api";
import { ApiError } from "@/lib/api/api-client";
import type { PreKeyBundleDto } from "@/lib/api/api-types";
import type { IIdentityStore } from "@/lib/db/identity-store";
import { isQuietDbCancel } from "@/lib/db/db-errors";
import type { ISessionStore } from "@/lib/db/session-store";

import { base64ToBytes, bytesToBase64 } from "./encoding";
import type { ICryptoEngine } from "./libsignal-adapter";
import type { PreKeyManager } from "./pre-key-manager";
import {
  protocolAddressId,
  sessionStoreKey,
} from "./signal-address";
import type { SendPayload } from "./types";

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export class IdentityKeyChangedError extends Error {
  readonly peerUserId: string;

  constructor(peerUserId: string, message?: string) {
    super(
      message ??
        "This contact's safety number changed. Verify it before sending.",
    );
    this.name = "IdentityKeyChangedError";
    this.peerUserId = peerUserId;
  }
}

export class SignalService {
  constructor(
    private readonly crypto: ICryptoEngine,
    private readonly identityStore: IIdentityStore,
    private readonly devicesApi: DevicesApi,
    private readonly preKeyManager: PreKeyManager,
    private readonly sessionStore: ISessionStore,
  ) {}

  async ensureSession(peerUserId: string, peerDeviceId: string): Promise<void> {
    const trust = await this.getIdentityTrust(peerUserId, peerDeviceId);
    if (trust.keyChanged) {
      throw new IdentityKeyChangedError(peerUserId);
    }

    const addr = protocolAddressId(peerUserId, peerDeviceId);
    const hasSession = await this.crypto.hasSession(addr);
    if (hasSession) {
      return;
    }
    const bundle = await this.fetchBundleWithReplenish(peerUserId, peerDeviceId);
    await this.ingestBundleIdentity(peerUserId, peerDeviceId, bundle);
    if ((await this.getIdentityTrust(peerUserId, peerDeviceId)).keyChanged) {
      throw new IdentityKeyChangedError(peerUserId);
    }
    await this.crypto.ensureSession(addr, bundle);
  }

  async encryptOutgoing(
    peerUserId: string,
    peerDeviceId: string,
    plaintext: string,
  ): Promise<SendPayload> {
    const trust = await this.getIdentityTrust(peerUserId, peerDeviceId);
    if (trust.keyChanged) {
      throw new IdentityKeyChangedError(peerUserId);
    }
    await this.ensureSession(peerUserId, peerDeviceId);
    const addr = protocolAddressId(peerUserId, peerDeviceId);
    const result = await this.crypto.encrypt(addr, plaintext);
    if (result.ciphertext.length === 0) {
      throw new Error("Encryption produced empty ciphertext");
    }
    return {
      recipientUserId: peerUserId,
      recipientDeviceId: peerDeviceId,
      messageType: result.messageType,
      ciphertextBase64: bytesToBase64(result.ciphertext),
    };
  }

  async decryptIncoming(
    senderUserId: string,
    senderDeviceId: string,
    messageType: 2 | 3,
    ciphertext: Uint8Array,
  ): Promise<string> {
    const addr = protocolAddressId(senderUserId, senderDeviceId);
    return this.crypto.decrypt(addr, ciphertext, messageType);
  }

  async getSafetyNumber(
    peerUserId: string,
    peerDeviceId: string,
  ): Promise<string> {
    const local = await this.identityStore.getLocalIdentity();
    const remoteKey = protocolAddressId(peerUserId, peerDeviceId);
    const remote =
      (await this.identityStore.getRemoteIdentity(remoteKey)) ??
      (await this.identityStore.getRemoteIdentity(peerUserId));
    if (!local || !remote) return "—";
    return this.crypto.computeSafetyNumber(
      local.identityKeyPublic,
      remote.identityKeyPublic,
      local.userId,
      peerUserId,
    );
  }

  async getIdentityTrust(
    peerUserId: string,
    peerDeviceId?: string,
  ): Promise<{
    keyChanged: boolean;
    verified: boolean;
    hasRemote: boolean;
  }> {
    const remote =
      peerDeviceId != null
        ? ((await this.identityStore.getRemoteIdentity(
            protocolAddressId(peerUserId, peerDeviceId),
          )) ??
          (await this.identityStore.getRemoteIdentity(peerUserId)))
        : await this.identityStore.getRemoteIdentity(peerUserId);
    if (!remote) {
      return { keyChanged: false, verified: false, hasRemote: false };
    }
    return {
      keyChanged: remote.keyChanged,
      verified: remote.verified,
      hasRemote: true,
    };
  }

  /**
   * Persist a new peer identity key as untrusted and clear the Signal session.
   * Call when a pre-key bundle or protocol store reports a different key.
   */
  async handleIdentityKeyChange(
    peerUserId: string,
    peerDeviceId: string,
    newPublicKey: Uint8Array,
  ): Promise<"ok" | "changed"> {
    const storeKey = protocolAddressId(peerUserId, peerDeviceId);
    const existing =
      (await this.identityStore.getRemoteIdentity(storeKey)) ??
      (await this.identityStore.getRemoteIdentity(peerUserId));
    if (existing && bytesEqual(existing.identityKeyPublic, newPublicKey)) {
      if (existing.keyChanged) return "changed";
      return "ok";
    }

    const fingerprint = bytesToBase64(newPublicKey);
    await this.sessionStore.delete(sessionStoreKey(peerUserId, peerDeviceId));
    await this.sessionStore.delete(storeKey);
    await this.sessionStore.delete(peerUserId);
    await this.identityStore.saveRemoteIdentity({
      peerUserId: storeKey,
      peerDeviceId,
      identityKeyPublic: newPublicKey,
      safetyNumber: "",
      verified: false,
      keyChanged: existing !== null,
      lastSeenKeyFingerprint: fingerprint,
    });

    // First time we see a key is not a "change".
    if (!existing) return "ok";
    return "changed";
  }

  /** User acknowledged the new identity key (optionally after verifying safety number). */
  async acceptNewIdentityKey(
    peerUserId: string,
    opts?: { markVerified?: boolean; peerDeviceId?: string },
  ): Promise<void> {
    const storeKey =
      opts?.peerDeviceId != null
        ? protocolAddressId(peerUserId, opts.peerDeviceId)
        : peerUserId;
    const remote =
      (await this.identityStore.getRemoteIdentity(storeKey)) ??
      (await this.identityStore.getRemoteIdentity(peerUserId));
    if (!remote) {
      throw new Error("No remote identity to accept");
    }
    if (opts?.peerDeviceId) {
      await this.sessionStore.delete(
        sessionStoreKey(peerUserId, opts.peerDeviceId),
      );
      await this.sessionStore.delete(storeKey);
    } else {
      await this.sessionStore.delete(`${peerUserId}.1`);
      await this.sessionStore.delete(peerUserId);
    }
    await this.identityStore.saveRemoteIdentity({
      ...remote,
      keyChanged: false,
      verified: opts?.markVerified ?? false,
    });
  }

  private async ingestBundleIdentity(
    peerUserId: string,
    peerDeviceId: string,
    bundle: PreKeyBundleDto,
  ): Promise<void> {
    const newKey = base64ToBytes(bundle.identityKeyPublicBase64);
    await this.handleIdentityKeyChange(peerUserId, peerDeviceId, newKey);
  }

  private async fetchBundleWithReplenish(
    peerUserId: string,
    peerDeviceId: string,
  ): Promise<PreKeyBundleDto> {
    try {
      return await this.devicesApi.getPreKeyBundle(peerUserId, peerDeviceId);
    } catch (e) {
      if (e instanceof ApiError && e.status === 428) {
        throw new Error(
          "Recipient has no pre-keys left. Ask them to open Gdot Chat.",
        );
      }
      throw e;
    }
  }

  /** Call after login/unlock so this device can receive new sessions. */
  async replenishLocalPreKeysIfNeeded(): Promise<void> {
    const run = () => this.preKeyManager.replenishOneTimePreKeys();
    try {
      await run();
    } catch (first) {
      if (isQuietDbCancel(first)) return;
      console.warn(
        "[SignalService] pre-key replenish failed; retrying once",
        first instanceof Error ? first.message : first,
      );
      try {
        await run();
      } catch (second) {
        if (isQuietDbCancel(second)) return;
        throw second;
      }
    }
  }
}
