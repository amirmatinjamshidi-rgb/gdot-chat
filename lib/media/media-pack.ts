/** Pack / unpack length-prefixed cipher chunks for blob cache and at-rest files. */

export function packCipherChunks(chunks: Uint8Array[]): Uint8Array {
  let total = 4;
  for (const c of chunks) total += 4 + c.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, chunks.length);
  let o = 4;
  for (const c of chunks) {
    view.setUint32(o, c.byteLength);
    o += 4;
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

export function unpackCipherChunks(
  packed: Uint8Array,
  expectedCount: number,
): Uint8Array[] {
  const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
  const count = view.getUint32(0);
  if (count !== expectedCount) {
    throw new Error("Cached media blob chunk count mismatch");
  }
  const chunks: Uint8Array[] = [];
  let o = 4;
  for (let i = 0; i < count; i++) {
    const len = view.getUint32(o);
    o += 4;
    chunks.push(packed.slice(o, o + len));
    o += len;
  }
  return chunks;
}
