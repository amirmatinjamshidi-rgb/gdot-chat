import type { RandomAccessFile } from "./random-access-file";
import { MemoryRandomAccessFile } from "./random-access-file";

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
  return { file, uri: `memory://${attachmentId}` };
}

export async function deleteLocalFile(_uri: string): Promise<void> {}
