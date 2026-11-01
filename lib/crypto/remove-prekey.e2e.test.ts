import { describe, expect, it } from "vitest";

import { ensureSignalInitialized } from "@/lib/crypto/init-signal";
import { LibSignalAdapter } from "@/lib/crypto/libsignal-adapter";
import { SignalProtocolStore } from "@/lib/crypto/signal-protocol-store";
import {
  MemoryCryptoKeyStore,
  MemoryIdentityStore,
  MemorySessionStore,
} from "@/lib/test/memory-stores";
import { bytesToBase64 } from "@/lib/crypto/encoding";

/**
 * E2E-ish: generate real Signal prekeys, store, removePreKey, ensure private material gone.
 */
describe("removePreKey (E2E crypto)", () => {
  it("generated OTK becomes irretrievable after removePreKey", async () => {
    await ensureSignalInitialized();
    const identity = new MemoryIdentityStore();
    const cryptoKeys = new MemoryCryptoKeyStore();
    const sessions = new MemorySessionStore();
    const engine = new LibSignalAdapter(identity, cryptoKeys, sessions);

    const idPair = await engine.generateIdentityKeyPair();
    await cryptoKeys.saveIdentityPrivateKey(idPair.privateKey);
    const registrationId = await engine.generateRegistrationId();
    await identity.saveLocalIdentity({
      userId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      username: `u_${Math.random().toString(36).slice(2)}`,
      registrationId,
      identityKeyPublic: idPair.publicKey,
    });

    const otks = await engine.generatePreKeys(10, 1);
    await cryptoKeys.saveOneTimePreKeys(otks);
    const keyId = otks[0]!.keyId;

    const protocol = new SignalProtocolStore(identity, cryptoKeys, sessions);
    expect(await protocol.loadPreKey(keyId)).toBeDefined();
    await protocol.removePreKey(keyId);
    expect(await protocol.loadPreKey(keyId)).toBeUndefined();
    // fingerprint that private bytes are cleared
    const raw = cryptoKeys.oneTime.get(keyId);
    expect(raw?.consumed).toBe(true);
    expect(raw?.privateKey.length).toBe(0);
    expect(bytesToBase64(otks[0]!.publicKey).length).toBeGreaterThan(0);
  });
});
