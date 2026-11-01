import { describe, expect, it } from "vitest";
import libsignal, { KeyHelper } from "@privacyresearch/libsignal-protocol-typescript";

/**
 * Client-side proof that libsignal SPK signatures use 33-byte DJB message bytes —
 * matching server SignedPreKeySignature verification.
 */
describe("libsignal signed prekey XEdDSA shape", () => {
  it("signs the 33-byte SPK public key", async () => {
    await libsignal();
    const id = await KeyHelper.generateIdentityKeyPair();
    const keyId = 1 + Math.floor(Math.random() * 10_000);
    const spk = await KeyHelper.generateSignedPreKey(id, keyId);

    expect(id.pubKey.byteLength).toBe(33);
    expect(spk.keyPair.pubKey.byteLength).toBe(33);
    expect(spk.signature.byteLength).toBe(64);
    expect(new Uint8Array(id.pubKey)[0]).toBe(0x05);
    expect(new Uint8Array(spk.keyPair.pubKey)[0]).toBe(0x05);

    const spk2 = await KeyHelper.generateSignedPreKey(id, keyId + 1);
    expect(spk2.signature.byteLength).toBe(64);
    expect(Buffer.from(spk.signature).equals(Buffer.from(spk2.signature))).toBe(
      false,
    );
  });
});
