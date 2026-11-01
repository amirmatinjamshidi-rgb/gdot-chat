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

/**
 * Mirrors SignalService.replenishLocalPreKeysIfNeeded retry policy without importing
 * SignalService (which pulls Expo debug logging into vitest).
 */
async function replenishWithRetry(manager: PreKeyManager): Promise<void> {
  const run = () => manager.replenishOneTimePreKeys();
  try {
    await run();
  } catch (first) {
    console.warn(
      "[SignalService] pre-key replenish failed; retrying once",
      first instanceof Error ? first.message : first,
    );
    await run();
  }
}

async function setupManager(upload: DevicesApi["uploadPreKeys"]) {
  await ensureSignalInitialized();
  const identity = new MemoryIdentityStore();
  const cryptoKeys = new MemoryCryptoKeyStore();
  const sessions = new MemorySessionStore();
  const engine = new LibSignalAdapter(identity, cryptoKeys, sessions);
  const idPair = await engine.generateIdentityKeyPair();
  await cryptoKeys.saveIdentityPrivateKey(idPair.privateKey);
  await identity.saveLocalIdentity({
    userId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    username: `u_${Math.random().toString(36).slice(2)}`,
    registrationId: await engine.generateRegistrationId(),
    identityKeyPublic: idPair.publicKey,
  });
  const devicesApi = { uploadPreKeys: upload } as unknown as DevicesApi;
  return new PreKeyManager(engine, cryptoKeys, identity, devicesApi);
}

describe("PreKey replenish error surfacing (E2E)", () => {
  it("retries once then throws when upload keeps failing", async () => {
    const upload = vi.fn(async () => {
      throw new Error("upload failed");
    });
    const manager = await setupManager(upload);
    await expect(replenishWithRetry(manager)).rejects.toThrow(/upload failed/);
    expect(upload.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("succeeds on retry after a transient failure", async () => {
    let calls = 0;
    const upload = vi.fn(async (_d: string, _b: UploadPreKeysRequest) => {
      calls += 1;
      if (calls === 1) throw new Error("transient");
    });
    const manager = await setupManager(upload);
    await replenishWithRetry(manager);
    expect(calls).toBe(2);
  });
});
