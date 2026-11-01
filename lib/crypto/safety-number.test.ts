import { describe, expect, it } from "vitest";

import { ensureSignalInitialized } from "@/lib/crypto/init-signal";
import { LibSignalAdapter } from "@/lib/crypto/libsignal-adapter";
import {
  MemoryCryptoKeyStore,
  MemoryIdentityStore,
  MemorySessionStore,
} from "@/lib/test/memory-stores";
import { protocolAddressId } from "@/lib/crypto/signal-address";

describe("Safety number (stable user ids)", () => {
  it("uses real local/remote user ids (not the literal peer) and is order-stable for same pair", async () => {
    const identity = new MemoryIdentityStore();
    const cryptoKeys = new MemoryCryptoKeyStore();
    const sessions = new MemorySessionStore();
    const engine = new LibSignalAdapter(identity, cryptoKeys, sessions);
    await ensureSignalInitialized();

    const localId = crypto.randomUUID();
    const remoteId = crypto.randomUUID();
    const localPair = await engine.generateIdentityKeyPair();
    const remotePair = await engine.generateIdentityKeyPair();

    const a = await engine.computeSafetyNumber(
      localPair.publicKey,
      remotePair.publicKey,
      localId,
      remoteId,
    );
    const b = await engine.computeSafetyNumber(
      localPair.publicKey,
      remotePair.publicKey,
      localId,
      remoteId,
    );
    expect(a).toBe(b);
    expect(a).not.toContain("peer");
    expect(a.length).toBeGreaterThan(10);

    const swappedLocal = await engine.computeSafetyNumber(
      localPair.publicKey,
      remotePair.publicKey,
      "peer",
      remoteId,
    );
    expect(swappedLocal).not.toBe(a);
  });
});

describe("Safety number E2E", () => {
  it("SignalService.getSafetyNumber embeds stable user ids", async () => {
    const { SignalService } = await import("@/lib/crypto/signal-service");
    const localUser = crypto.randomUUID();
    const localDevice = crypto.randomUUID();
    const remoteUser = crypto.randomUUID();
    const remoteDevice = crypto.randomUUID();

    const identity = new MemoryIdentityStore();
    const cryptoKeys = new MemoryCryptoKeyStore();
    const sessions = new MemorySessionStore();
    const engine = new LibSignalAdapter(identity, cryptoKeys, sessions);
    await ensureSignalInitialized();
    const localPair = await engine.generateIdentityKeyPair();
    const remotePair = await engine.generateIdentityKeyPair();

    await identity.saveLocalIdentity({
      userId: localUser,
      deviceId: localDevice,
      username: "local",
      registrationId: 1,
      identityKeyPublic: localPair.publicKey,
    });
    await identity.saveRemoteIdentity({
      peerUserId: protocolAddressId(remoteUser, remoteDevice),
      peerDeviceId: remoteDevice,
      identityKeyPublic: remotePair.publicKey,
      safetyNumber: "",
      verified: false,
      keyChanged: false,
      lastSeenKeyFingerprint: "x",
    });

    const service = new SignalService(
      engine,
      identity,
      { getPreKeyBundle: async () => { throw new Error("unused"); } } as never,
      { replenishOneTimePreKeys: async () => undefined } as never,
      sessions,
    );

    const sn = await service.getSafetyNumber(remoteUser, remoteDevice);
    const direct = await engine.computeSafetyNumber(
      localPair.publicKey,
      remotePair.publicKey,
      localUser,
      remoteUser,
    );
    expect(sn).toBe(direct);
  });
});
