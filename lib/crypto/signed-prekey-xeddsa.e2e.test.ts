import { describe, expect, it } from "vitest";
import libsignal, { KeyHelper } from "@privacyresearch/libsignal-protocol-typescript";
import { bytesToBase64 } from "@/lib/crypto/encoding";

describe("signed prekey client material for server verify (E2E)", () => {
  it("emits base64 fields the server Accepts (33-byte pubs + 64-byte sig)", async () => {
    await libsignal();
    const id = await KeyHelper.generateIdentityKeyPair();
    const spk = await KeyHelper.generateSignedPreKey(
      id,
      1 + Math.floor(Math.random() * 50_000),
    );
    const identityKeyPublicBase64 = bytesToBase64(new Uint8Array(id.pubKey));
    const publicKeyBase64 = bytesToBase64(new Uint8Array(spk.keyPair.pubKey));
    const signatureBase64 = bytesToBase64(new Uint8Array(spk.signature));

    expect(Buffer.from(identityKeyPublicBase64, "base64").length).toBe(33);
    expect(Buffer.from(publicKeyBase64, "base64").length).toBe(33);
    expect(Buffer.from(signatureBase64, "base64").length).toBe(64);
    // Randomness: two runs differ
    const spkB = await KeyHelper.generateSignedPreKey(id, spk.keyId + 1);
    expect(bytesToBase64(new Uint8Array(spkB.signature))).not.toBe(signatureBase64);
  });
});
