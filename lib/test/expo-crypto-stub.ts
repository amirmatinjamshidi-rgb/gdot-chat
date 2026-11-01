import { webcrypto } from "node:crypto";

export function randomUUID(): string {
  return webcrypto.randomUUID();
}

export function getRandomBytes(byteCount: number): Uint8Array {
  const bytes = new Uint8Array(byteCount);
  webcrypto.getRandomValues(bytes);
  return bytes;
}

export function getRandomValues<T extends ArrayBufferView>(typedArray: T): T {
  const bytes = new Uint8Array(typedArray.byteLength);
  webcrypto.getRandomValues(bytes);
  const view = new Uint8Array(
    typedArray.buffer,
    typedArray.byteOffset,
    typedArray.byteLength,
  );
  view.set(bytes);
  return typedArray;
}
