import { gcm } from "@noble/ciphers/aes.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { getRandomBytes } from "expo-crypto";

import { bytesToBase64, base64ToBytes } from "@/lib/crypto/encoding";

/** Wire message type for group SenderKey ciphertext (server fan-out). */
export const SENDER_KEY_MESSAGE_TYPE = 4;

const CHAIN_INFO = new TextEncoder().encode("gdot-sender-chain-v1");
const MSG_INFO = new TextEncoder().encode("gdot-sender-msg-v1");

export type SenderKeyState = {
  keyId: number;
  iteration: number;
  chainKey: Uint8Array;
  /** HMAC key distributed with the chain; authenticates ciphertext. */
  macKey: Uint8Array;
};

export type SenderKeyDistribution = {
  groupId: string;
  senderUserId: string;
  senderDeviceId: string;
  keyId: number;
  iteration: number;
  chainKey: Uint8Array;
  macKey: Uint8Array;
};

export type SenderKeyDistributionWire = {
  v: 1;
  t: "sender_key_distribution";
  groupId: string;
  senderUserId: string;
  senderDeviceId: string;
  keyId: number;
  iteration: number;
  chainKeyB64: string;
  macKeyB64: string;
};

export type SenderKeyCiphertextWire = {
  v: 1;
  keyId: number;
  iteration: number;
  ciphertextB64: string;
  macB64: string;
  nonceB64: string;
};

function hkdfLike(seed: Uint8Array, info: Uint8Array, len: number): Uint8Array {
  const prk = hmac(sha256, new Uint8Array(32), seed);
  const out = hmac(sha256, prk, info);
  return out.slice(0, len);
}

function ratchetChainKey(chainKey: Uint8Array): {
  nextChain: Uint8Array;
  messageKey: Uint8Array;
} {
  const messageKey = hkdfLike(chainKey, MSG_INFO, 32);
  const nextChain = hkdfLike(chainKey, CHAIN_INFO, 32);
  return { nextChain, messageKey };
}

function randomKeyId(): number {
  const b = getRandomBytes(4);
  return (
    ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0
  );
}

export function createSendingSenderKeyState(keyId?: number): SenderKeyState {
  return {
    keyId: keyId ?? randomKeyId(),
    iteration: 0,
    chainKey: getRandomBytes(32),
    macKey: getRandomBytes(32),
  };
}

export function toDistribution(
  groupId: string,
  senderUserId: string,
  senderDeviceId: string,
  state: SenderKeyState,
): SenderKeyDistribution {
  return {
    groupId,
    senderUserId,
    senderDeviceId,
    keyId: state.keyId,
    iteration: state.iteration,
    chainKey: new Uint8Array(state.chainKey),
    macKey: new Uint8Array(state.macKey),
  };
}

export function serializeDistribution(d: SenderKeyDistribution): string {
  const wire: SenderKeyDistributionWire = {
    v: 1,
    t: "sender_key_distribution",
    groupId: d.groupId,
    senderUserId: d.senderUserId,
    senderDeviceId: d.senderDeviceId,
    keyId: d.keyId,
    iteration: d.iteration,
    chainKeyB64: bytesToBase64(d.chainKey),
    macKeyB64: bytesToBase64(d.macKey),
  };
  return JSON.stringify(wire);
}

export function parseDistribution(plaintext: string): SenderKeyDistribution | null {
  try {
    const j = JSON.parse(plaintext) as Partial<SenderKeyDistributionWire>;
    if (j.v !== 1 || j.t !== "sender_key_distribution") return null;
    if (
      typeof j.groupId !== "string" ||
      typeof j.senderUserId !== "string" ||
      typeof j.senderDeviceId !== "string" ||
      typeof j.keyId !== "number" ||
      typeof j.iteration !== "number" ||
      typeof j.chainKeyB64 !== "string" ||
      typeof j.macKeyB64 !== "string"
    ) {
      return null;
    }
    return {
      groupId: j.groupId,
      senderUserId: j.senderUserId,
      senderDeviceId: j.senderDeviceId,
      keyId: j.keyId,
      iteration: j.iteration,
      chainKey: base64ToBytes(j.chainKeyB64),
      macKey: base64ToBytes(j.macKeyB64),
    };
  } catch {
    return null;
  }
}

export function stateFromDistribution(d: SenderKeyDistribution): SenderKeyState {
  return {
    keyId: d.keyId,
    iteration: d.iteration,
    chainKey: new Uint8Array(d.chainKey),
    macKey: new Uint8Array(d.macKey),
  };
}

function macPayload(
  keyId: number,
  iteration: number,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
): Uint8Array {
  const header = new Uint8Array(8);
  const view = new DataView(header.buffer);
  view.setUint32(0, keyId >>> 0, false);
  view.setUint32(4, iteration >>> 0, false);
  const out = new Uint8Array(header.length + nonce.length + ciphertext.length);
  out.set(header, 0);
  out.set(nonce, header.length);
  out.set(ciphertext, header.length + nonce.length);
  return out;
}

function computeMac(macKey: Uint8Array, payload: Uint8Array): Uint8Array {
  return hmac(sha256, macKey, payload);
}

function macEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a[i]! ^ b[i]!;
  return x === 0;
}

export async function encryptSenderKey(
  state: SenderKeyState,
  plaintext: Uint8Array,
): Promise<{ wire: SenderKeyCiphertextWire; nextState: SenderKeyState }> {
  const { nextChain, messageKey } = ratchetChainKey(state.chainKey);
  const nonce = getRandomBytes(12);
  const aes = gcm(new Uint8Array(messageKey), new Uint8Array(nonce));
  const ciphertext = aes.encrypt(new Uint8Array(plaintext));
  const iteration = state.iteration;
  const payload = macPayload(state.keyId, iteration, nonce, ciphertext);
  const mac = computeMac(state.macKey, payload);
  return {
    wire: {
      v: 1,
      keyId: state.keyId,
      iteration,
      ciphertextB64: bytesToBase64(ciphertext),
      macB64: bytesToBase64(mac),
      nonceB64: bytesToBase64(nonce),
    },
    nextState: {
      ...state,
      iteration: iteration + 1,
      chainKey: new Uint8Array(nextChain),
    },
  };
}

export function serializeSenderKeyCiphertext(wire: SenderKeyCiphertextWire): string {
  return JSON.stringify(wire);
}

export function parseSenderKeyCiphertext(raw: string): SenderKeyCiphertextWire | null {
  try {
    const j = JSON.parse(raw) as Partial<SenderKeyCiphertextWire>;
    if (
      j.v !== 1 ||
      typeof j.keyId !== "number" ||
      typeof j.iteration !== "number" ||
      typeof j.ciphertextB64 !== "string" ||
      typeof j.macB64 !== "string" ||
      typeof j.nonceB64 !== "string"
    ) {
      return null;
    }
    return j as SenderKeyCiphertextWire;
  } catch {
    return null;
  }
}

export async function decryptSenderKey(
  state: SenderKeyState,
  wire: SenderKeyCiphertextWire,
  opts?: { maxSkip?: number },
): Promise<{ plaintext: Uint8Array; nextState: SenderKeyState }> {
  if (wire.keyId !== state.keyId) {
    throw new SenderKeyError("UNKNOWN_KEY_ID", "Sender key id mismatch");
  }
  const maxSkip = opts?.maxSkip ?? 2000;
  if (wire.iteration < state.iteration) {
    throw new SenderKeyError("DUPLICATE", "Sender key iteration already used");
  }
  if (wire.iteration - state.iteration > maxSkip) {
    throw new SenderKeyError("TOO_OLD", "Sender key iteration too far ahead");
  }

  let chainKey = new Uint8Array(state.chainKey);
  let iteration = state.iteration;
  let messageKey: Uint8Array | null = null;
  while (iteration <= wire.iteration) {
    const stepped = ratchetChainKey(chainKey);
    chainKey = new Uint8Array(stepped.nextChain);
    if (iteration === wire.iteration) messageKey = new Uint8Array(stepped.messageKey);
    iteration += 1;
  }
  if (!messageKey) {
    throw new SenderKeyError("INTERNAL", "Failed to derive message key");
  }

  const nonce = base64ToBytes(wire.nonceB64);
  const ciphertext = base64ToBytes(wire.ciphertextB64);
  const mac = base64ToBytes(wire.macB64);
  const payload = macPayload(wire.keyId, wire.iteration, nonce, ciphertext);
  if (!macEqual(computeMac(state.macKey, payload), mac)) {
    throw new SenderKeyError("BAD_SIGNATURE", "Sender key MAC invalid");
  }

  try {
    const aes = gcm(new Uint8Array(messageKey), new Uint8Array(nonce));
    const plaintext = aes.decrypt(ciphertext);
    return {
      plaintext: new Uint8Array(plaintext),
      nextState: {
        ...state,
        iteration: wire.iteration + 1,
        chainKey: new Uint8Array(chainKey),
      },
    };
  } catch {
    throw new SenderKeyError("DECRYPT_FAILED", "Sender key AES-GCM decrypt failed");
  }
}

export class SenderKeyError extends Error {
  constructor(
    public readonly code:
      | "UNKNOWN_KEY_ID"
      | "DUPLICATE"
      | "TOO_OLD"
      | "BAD_SIGNATURE"
      | "DECRYPT_FAILED"
      | "MISSING_KEY"
      | "INTERNAL",
    message: string,
  ) {
    super(message);
    this.name = "SenderKeyError";
  }
}
