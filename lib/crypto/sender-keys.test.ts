import { describe, expect, it } from "vitest";

import {
  createSendingSenderKeyState,
  decryptSenderKey,
  encryptSenderKey,
  parseDistribution,
  serializeDistribution,
  stateFromDistribution,
  toDistribution,
  SenderKeyError,
} from "./sender-keys";
import { textToBytes, bytesToText } from "./encoding";

describe("sender-keys", () => {
  it("round-trips encrypt/decrypt with ratchet advance", async () => {
    const sending = createSendingSenderKeyState(42);
    const dist = toDistribution(
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
      sending,
    );
    let receiving = stateFromDistribution(dist);

    const msg = textToBytes(`hello_${crypto.randomUUID().slice(0, 8)}`);
    const { wire, nextState } = await encryptSenderKey(sending, msg);
    expect(nextState.iteration).toBe(1);

    const dec = await decryptSenderKey(receiving, wire);
    expect(bytesToText(dec.plaintext)).toBe(bytesToText(msg));
    expect(dec.nextState.iteration).toBe(1);
  });

  it("catches up out-of-order iterations without sleeping", async () => {
    let sending = createSendingSenderKeyState();
    const dist = toDistribution("g", "u", "d", sending);
    let receiving = stateFromDistribution(dist);

    const wires = [];
    for (let i = 0; i < 3; i++) {
      const r = await encryptSenderKey(sending, textToBytes(`m${i}`));
      sending = r.nextState;
      wires.push(r.wire);
    }

    // Deliver last first — skip ahead
    const last = await decryptSenderKey(receiving, wires[2]!);
    expect(bytesToText(last.plaintext)).toBe("m2");
    expect(last.nextState.iteration).toBe(3);

    await expect(
      decryptSenderKey(last.nextState, wires[0]!),
    ).rejects.toBeInstanceOf(SenderKeyError);
  });

  it("rejects tampered MAC", async () => {
    const sending = createSendingSenderKeyState();
    const receiving = stateFromDistribution(
      toDistribution("g", "u", "d", sending),
    );
    const { wire } = await encryptSenderKey(sending, textToBytes("x"));
    const bad = { ...wire, macB64: wire.ciphertextB64 };
    await expect(decryptSenderKey(receiving, bad)).rejects.toMatchObject({
      code: "BAD_SIGNATURE",
    });
  });

  it("serialize/parse distribution preserves random keys", () => {
    const state = createSendingSenderKeyState();
    const d = toDistribution(
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
      state,
    );
    const restored = parseDistribution(serializeDistribution(d));
    expect(restored).toEqual(d);
  });
});
