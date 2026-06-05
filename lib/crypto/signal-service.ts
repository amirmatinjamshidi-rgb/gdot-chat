import type { DevicesApi } from "@/lib/api/devices-api";
import { ApiError } from "@/lib/api/api-client";
import type { PreKeyBundleDto } from "@/lib/api/api-types";
import type { IIdentityStore } from "@/lib/db/identity-store";

import type { ICryptoEngine } from "./libsignal-adapter";
import type { PreKeyManager } from "./pre-key-manager";
import type { SendPayload } from "./types";
import { bytesToBase64 } from "./encoding";

function protocolAddressId(peerUserId: string): string {
  return peerUserId;
}

export class SignalService {
  constructor(
    private readonly crypto: ICryptoEngine,
    private readonly identityStore: IIdentityStore,
    private readonly devicesApi: DevicesApi,
    private readonly preKeyManager: PreKeyManager,
  ) {}

  async ensureSession(peerUserId: string, peerDeviceId: string): Promise<void> {
    const addr = protocolAddressId(peerUserId);
    const bundle = await this.fetchBundleWithReplenish(peerUserId, peerDeviceId);
    await this.crypto.ensureSession(addr, bundle);
  }

  async encryptOutgoing(
    peerUserId: string,
    peerDeviceId: string,
    plaintext: string,
  ): Promise<SendPayload> {
    await this.ensureSession(peerUserId, peerDeviceId);
    const addr = protocolAddressId(peerUserId);
    const result = await this.crypto.encrypt(addr, plaintext);
    return {
      recipientUserId: peerUserId,
      recipientDeviceId: peerDeviceId,
      messageType: result.messageType,
      ciphertextBase64: bytesToBase64(result.ciphertext),
    };
  }

  async decryptIncoming(
    senderUserId: string,
    messageType: 2 | 3,
    ciphertext: Uint8Array,
  ): Promise<string> {
    const addr = protocolAddressId(senderUserId);
    return this.crypto.decrypt(addr, ciphertext, messageType);
  }

  async getSafetyNumber(
    peerUserId: string,
    peerDeviceId: string,
  ): Promise<string> {
    void peerDeviceId;
    const local = await this.identityStore.getLocalIdentity();
    const remote = await this.identityStore.getRemoteIdentity(peerUserId);
    if (!local || !remote) return "—";
    return this.crypto.computeSafetyNumber(
      local.identityKeyPublic,
      remote.identityKeyPublic,
    );
  }

  async handleIdentityKeyChange(
    peerDeviceId: string,
    newPublicKey: Uint8Array,
  ): Promise<"ok" | "changed"> {
    void peerDeviceId;
    void newPublicKey;
    return "ok";
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
    try {
      await this.preKeyManager.replenishOneTimePreKeys();
    } catch {
      if (__DEV__) {
        console.warn("[SignalService] pre-key upload skipped");
      }
    }
  }
}
