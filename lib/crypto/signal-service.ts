import type { DevicesApi } from "@/lib/api/devices-api";
import type { IIdentityStore } from "@/lib/db/identity-store";
import type { ISessionStore } from "@/lib/db/session-store";

import type { LibSignalAdapter } from "./libsignal-adapter";
import type { ICryptoEngine } from "./libsignal-adapter";
import type { SendPayload, SessionRecord } from "./types";
import { bytesToBase64 } from "./encoding";

export class SignalService {
  constructor(
    private readonly crypto: ICryptoEngine & Partial<LibSignalAdapter>,
    private readonly sessionStore: ISessionStore,
    private readonly identityStore: IIdentityStore,
    private readonly devicesApi: DevicesApi,
  ) {}

  async ensureSession(peerUserId: string, peerDeviceId: string): Promise<void> {
    const existing = await this.sessionStore.get(peerDeviceId);
    if (existing) return;

    const local = await this.identityStore.getLocalIdentity();
    if (!local) throw new Error("Local identity missing");

    try {
      const bundle = await this.devicesApi.getPreKeyBundle(
        peerUserId,
        peerDeviceId,
      );
      const adapter = this.crypto as LibSignalAdapter;
      const { session } = await adapter.processPreKeyBundle!(
        new Uint8Array(32),
        local.registrationId,
        JSON.stringify(bundle),
      );
      session.peerDeviceId = peerDeviceId;
      await this.sessionStore.save(peerDeviceId, session);
    } catch {
      const adapter = this.crypto as LibSignalAdapter;
      const session = adapter.initialSession(peerDeviceId);
      await this.sessionStore.save(peerDeviceId, session);
    }
  }

  async encryptOutgoing(
    peerUserId: string,
    peerDeviceId: string,
    plaintext: string,
  ): Promise<SendPayload> {
    await this.ensureSession(peerUserId, peerDeviceId);
    let session = await this.sessionStore.get(peerDeviceId);
    if (!session) {
      const adapter = this.crypto as LibSignalAdapter;
      session = adapter.initialSession(peerDeviceId);
    }
    const result = await this.crypto.encrypt(session, plaintext);
    await this.sessionStore.save(peerDeviceId, {
      peerDeviceId,
      serialized: result.updatedSession,
    });
    return {
      recipientUserId: peerUserId,
      recipientDeviceId: peerDeviceId,
      messageType: result.messageType,
      ciphertextBase64: bytesToBase64(result.ciphertext),
    };
  }

  async decryptIncoming(
    senderDeviceId: string,
    messageType: 2 | 3,
    ciphertext: Uint8Array,
  ): Promise<string> {
    let session = await this.sessionStore.get(senderDeviceId);
    if (!session) {
      const adapter = this.crypto as LibSignalAdapter;
      session = adapter.initialSession(senderDeviceId);
    }
    const plaintext = await this.crypto.decrypt(session, ciphertext, messageType);
    return plaintext;
  }

  async getSafetyNumber(
    peerUserId: string,
    peerDeviceId: string,
  ): Promise<string> {
    void peerUserId;
    const local = await this.identityStore.getLocalIdentity();
    const remote = await this.identityStore.getRemoteIdentity(peerDeviceId);
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
    const remote = await this.identityStore.getRemoteIdentity(peerDeviceId);
    if (!remote) return "ok";
    const fp = bytesToBase64(newPublicKey);
    if (remote.lastSeenKeyFingerprint !== fp) {
      return "changed";
    }
    return "ok";
  }
}
