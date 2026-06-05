export function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export function arrayBufferToBytes(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}

export function utf8ToArrayBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

export function arrayBufferToUtf8(buf: ArrayBuffer): string {
  return new TextDecoder().decode(new Uint8Array(buf));
}
