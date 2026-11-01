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

/** Convert a libsignal "binary string" (char codes 0–255) to bytes without UTF-8 expansion. */
export function binaryStringToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    out[i] = s.charCodeAt(i) & 0xff;
  }
  return out;
}
