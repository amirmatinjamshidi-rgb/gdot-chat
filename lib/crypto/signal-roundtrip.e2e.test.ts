import { describe, expect, it } from "vitest";

import { ensureSignalInitialized } from "@/lib/crypto/init-signal";
import { LibSignalAdapter } from "@/lib/crypto/libsignal-adapter";
import { bytesToBase64 } from "@/lib/crypto/encoding";
import type { PreKeyBundleDto } from "@/lib/api/api-types";
import {
  MemoryCryptoKeyStore,
  MemoryIdentityStore,
  MemorySessionStore,
} from "@/lib/test/memory-stores";

async function buildUser(label: string) {
  const identity = new MemoryIdentityStore();
  const cryptoKeys = new MemoryCryptoKeyStore();
  const sessions = new MemorySessionStore();
  const engine = new LibSignalAdapter(identity, cryptoKeys, sessions);
  await ensureSignalInitialized();
  const idPair = await engine.generateIdentityKeyPair();
  const registrationId = await engine.generateRegistrationId();
  const userId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  await cryptoKeys.saveIdentityPrivateKey(idPair.privateKey);
  await identity.saveLocalIdentity({
    userId,
    deviceId,
    username: `${label}_${Math.random().toString(36).slice(2, 8)}`,
    registrationId,
    identityKeyPublic: idPair.publicKey,
  });
  const spk = await engine.generateSignedPreKey(idPair, 1);
  await cryptoKeys.saveSignedPreKey(spk);
  const otks = await engine.generatePreKeys(1, 5);
  await cryptoKeys.saveOneTimePreKeys(otks);
  return { identity, cryptoKeys, sessions, engine, userId, deviceId, idPair, registrationId, spk, otks };
}

describe("Signal encrypt/decrypt round-trip (E2E)", () => {
  it("alice encrypts to bob bundle; bob decrypts original plaintext", async () => {
    const alice = await buildUser("alice");
    const bob = await buildUser("bob");

    const otk = bob.otks[0]!;
    const bundle: PreKeyBundleDto = {
      userId: bob.userId,
      identityKeyPublicBase64: bytesToBase64(bob.idPair.publicKey),
      registrationId: bob.registrationId,
      deviceId: bob.deviceId,
      signedPreKey: {
        keyId: bob.spk.keyId,
        publicKeyBase64: bytesToBase64(bob.spk.publicKey),
        signatureBase64: bytesToBase64(bob.spk.signature),
      },
      oneTimePreKey: {
        keyId: otk.keyId,
        publicKeyBase64: bytesToBase64(otk.publicKey),
      },
    };

    // Recipient must still have the OTK private key until SessionCipher consumes it.
    await alice.engine.ensureSession(bob.userId, bundle);
    const plaintext = `hello-${crypto.randomUUID()}`;
    const encrypted = await alice.engine.encrypt(bob.userId, plaintext);
    expect(encrypted.ciphertext.length).toBeGreaterThan(0);
    // Encoding fix: ciphertext must not be UTF-8-expanded relative to a latin1 body.
    // (If TextEncoder were used on binary string, length would often be > original.)
    expect(encrypted.messageType === 2 || encrypted.messageType === 3).toBe(true);

    const decrypted = await bob.engine.decrypt(
      alice.userId,
      encrypted.ciphertext,
      encrypted.messageType,
    );
    expect(decrypted).toBe(plaintext);
  });
});
