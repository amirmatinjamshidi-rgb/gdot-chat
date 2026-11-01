export interface RandomAccessFile {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
  write(offset: number, data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export class MemoryRandomAccessFile implements RandomAccessFile {
  constructor(private buffer: Uint8Array) {}

  get size(): number {
    return this.buffer.length;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    return this.buffer.slice(offset, offset + length);
  }

  async write(offset: number, data: Uint8Array): Promise<void> {
    const needed = offset + data.length;
    if (needed > this.buffer.length) {
      const next = new Uint8Array(needed);
      next.set(this.buffer);
      this.buffer = next;
    }
    this.buffer.set(data, offset);
  }

  async close(): Promise<void> {}

  bytes(): Uint8Array {
    return this.buffer;
  }
}

export function extensionForMime(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("quicktime") || mimeType.includes("mov")) return "mov";
  if (mimeType.includes("m4a") || mimeType.includes("mp4a") || mimeType.includes("aac"))
    return "m4a";
  if (mimeType.includes("3gpp")) return "3gp";
  return "bin";
}
