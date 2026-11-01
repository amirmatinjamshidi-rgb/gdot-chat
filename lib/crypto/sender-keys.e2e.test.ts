import { describe, expect, it } from "vitest";

import {
  createSendingSenderKeyState,
  decryptSenderKey,
  encryptSenderKey,
  stateFromDistribution,
  toDistribution,
} from "./sender-keys";
import { textToBytes, bytesToText } from "./encoding";

describe("sender-keys E2E rotation", () => {
  it("after rotation old key cannot decrypt new messages", async () => {
    const groupId = crypto.randomUUID();
    const user = crypto.randomUUID();
    const device = crypto.randomUUID();

    const key1 = createSendingSenderKeyState();
    const recv1 = stateFromDistribution(toDistribution(groupId, user, device, key1));
    const { wire: w1 } = await encryptSenderKey(key1, textToBytes("before"));
    expect(bytesToText((await decryptSenderKey(recv1, w1)).plaintext)).toBe(
      "before",
    );

    const key2 = createSendingSenderKeyState(); // rotation
    const recv2 = stateFromDistribution(toDistribution(groupId, user, device, key2));
    const { wire: w2 } = await encryptSenderKey(key2, textToBytes("after"));
    expect(bytesToText((await decryptSenderKey(recv2, w2)).plaintext)).toBe(
      "after",
    );

    // Old receiver state / key id cannot read new ciphertext
    await expect(decryptSenderKey(recv1, w2)).rejects.toMatchObject({
      code: "UNKNOWN_KEY_ID",
    });
  });
});
