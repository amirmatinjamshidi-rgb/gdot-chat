import type { RandomAccessFile } from "./random-access-file";
import { MemoryRandomAccessFile } from "./random-access-file";
import { MEDIA_AT_REST_EXT } from "./media-at-rest";
import type { VaultFileAccess } from "./media-playback-vault";

export type { RandomAccessFile } from "./random-access-file";
export { MemoryRandomAccessFile, extensionForMime } from "./random-access-file";

export async function openExistingFile(_uri: string): Promise<RandomAccessFile> {
  throw new Error("Local media files are only available on iOS/Android.");
}

export async function createOutputFile(
  attachmentId: string,
  _extension: string,
  size: number,
): Promise<{ file: RandomAccessFile; uri: string }> {
  const file = new MemoryRandomAccessFile(new Uint8Array(size));
  return { file, uri: `memory://gdot-media/${attachmentId}.${MEDIA_AT_REST_EXT}` };
}

export async function createPlainOutputFile(
  attachmentId: string,
  extension: string,
  size: number,
): Promise<{ file: RandomAccessFile; uri: string }> {
  const file = new MemoryRandomAccessFile(new Uint8Array(size));
  return { file, uri: `memory://gdot-media/${attachmentId}.${extension}` };
}

export async function deleteLocalFile(_uri: string): Promise<void> {}

export async function wipeMediaPlaybackTemp(): Promise<number> {
  return 0;
}

export function createNativeVaultFileAccess(): VaultFileAccess {
  const durable = new Map<string, Uint8Array>();
  const tmp = new Map<string, Uint8Array>();
  return {
    async readFileBytes(uri: string) {
      const b = durable.get(uri) ?? tmp.get(uri);
      if (!b) throw new Error("missing");
      return new Uint8Array(b);
    },
    async writeFileBytes(uri: string, bytes: Uint8Array) {
      if (uri.includes("tmp")) tmp.set(uri, new Uint8Array(bytes));
      else durable.set(uri, new Uint8Array(bytes));
    },
    async deleteFile(uri: string) {
      durable.delete(uri);
      tmp.delete(uri);
    },
    async ensureDir() {},
    durableUri(attachmentId: string, ext = MEDIA_AT_REST_EXT) {
      return `memory://gdot-media/${attachmentId}.${ext}`;
    },
    tmpUri(attachmentId: string, ext: string) {
      return `memory://gdot-media-tmp/${attachmentId}.${ext}`;
    },
    async listDurableFiles() {
      return [...durable.keys()];
    },
    async listTmpFiles() {
      return [...tmp.keys()];
    },
    async wipeTmp() {
      const n = tmp.size;
      tmp.clear();
      return n;
    },
  };
}
