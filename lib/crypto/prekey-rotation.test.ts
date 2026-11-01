import { describe, expect, it, vi } from "vitest";

import { PreKeyManager } from "@/lib/crypto/pre-key-manager";
import { ensureSignalInitialized } from "@/lib/crypto/init-signal";
import { LibSignalAdapter } from "@/lib/crypto/libsignal-adapter";
import type { DevicesApi } from "@/lib/api/devices-api";
import type { UploadPreKeysRequest } from "@/lib/api/api-types";
import {
  MemoryCryptoKeyStore,
  MemoryIdentityStore,
  MemorySessionStore,
} from "@/lib/test/memory-stores";

function uniqueIds() {
  return {
    userId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    username: `user_${Math.random().toString(36).slice(2, 10)}`,
  };
}

describe("PreKeyManager SPK rotation (API/unit)", () => {
  it("uploads a new signedPreKey keyId on each replenish", async () => {
    await ensureSignalInitialized();
    const ids = uniqueIds();
    const identity = new MemoryIdentityStore();
    const cryptoKeys = new MemoryCryptoKeyStore();
    const sessions = new MemorySessionStore();
    const engine = new LibSignalAdapter(identity, cryptoKeys, sessions);

    const idPair = await engine.generateIdentityKeyPair();
    await cryptoKeys.saveIdentityPrivateKey(idPair.privateKey);
    await identity.saveLocalIdentity({
      ...ids,
      registrationId: await engine.generateRegistrationId(),
      identityKeyPublic: idPair.publicKey,
    });

    const uploads: UploadPreKeysRequest[] = [];
    const devicesApi = {
      uploadPreKeys: vi.fn(async (_deviceId: string, body: UploadPreKeysRequest) => {
        uploads.push(body);
      }),
    } as unknown as DevicesApi;

    const manager = new PreKeyManager(engine, cryptoKeys, identity, devicesApi);
    await manager.replenishOneTimePreKeys();
    await manager.replenishOneTimePreKeys();

    expect(uploads).toHaveLength(2);
    expect(uploads[0]!.signedPreKey.keyId).toBe(1);
    expect(uploads[1]!.signedPreKey.keyId).toBe(2);
    expect(uploads[0]!.signedPreKey.keyId).not.toBe(uploads[1]!.signedPreKey.keyId);
    expect(uploads[1]!.oneTimePreKeys[0]!.keyId).toBeGreaterThan(
      uploads[0]!.oneTimePreKeys.at(-1)!.keyId,
    );
  });
});
