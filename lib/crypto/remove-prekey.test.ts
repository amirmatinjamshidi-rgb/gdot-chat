import { describe, expect, it } from "vitest";

import { SignalProtocolStore } from "@/lib/crypto/signal-protocol-store";
import {
  MemoryCryptoKeyStore,
  MemoryIdentityStore,
  MemorySessionStore,
} from "@/lib/test/memory-stores";

describe("removePreKey (API/unit)", () => {
  it("marks OTK consumed and clears private key so loadPreKey cannot retrieve it", async () => {
    const cryptoKeys = new MemoryCryptoKeyStore();
    const store = new SignalProtocolStore(
      new MemoryIdentityStore(),
      cryptoKeys,
      new MemorySessionStore(),
    );

    const pub = new Uint8Array(32).fill(7);
    const priv = new Uint8Array(32).fill(9);
    await cryptoKeys.saveOneTimePreKeys([
      { keyId: 42, publicKey: pub, privateKey: priv },
    ]);

    const before = await store.loadPreKey(42);
    expect(before).toBeDefined();
    expect(new Uint8Array(before!.privKey)).toEqual(priv);

    await store.removePreKey(42);

    const after = await store.loadPreKey(42);
    expect(after).toBeUndefined();
    expect(await cryptoKeys.getOneTimePreKey(42)).toBeNull();
  });
});
