import { Directory, File, Paths } from "expo-file-system";

import type { RandomAccessFile } from "./random-access-file";

export type { RandomAccessFile } from "./random-access-file";
export { MemoryRandomAccessFile, extensionForMime } from "./random-access-file";

type NativeFsFile = {
  uri: string;
  exists: boolean;
  size: number | null;
  create(): void;
  delete(): void;
  open(): {
    offset: number | null;
    readBytes(length: number): Uint8Array;
    writeBytes(bytes: Uint8Array): void;
    close(): void;
  };
};

type NativeFsDirectory = {
  exists: boolean;
  create(): void;
};

class ExpoRandomAccessFile implements RandomAccessFile {
  constructor(
    private readonly file: NativeFsFile,
    readonly size: number,
  ) {}

  async read(offset: number, length: number): Promise<Uint8Array> {
    const handle = this.file.open();
    try {
      handle.offset = offset;
      return handle.readBytes(length);
    } finally {
      handle.close();
    }
  }

  async write(offset: number, data: Uint8Array): Promise<void> {
    const handle = this.file.open();
    try {
      handle.offset = offset;
      handle.writeBytes(data);
    } finally {
      handle.close();
    }
  }

  async close(): Promise<void> {}
}

function mediaDir(): NativeFsDirectory {
  const dir = new Directory(Paths.document, "gdot-media") as unknown as NativeFsDirectory;
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

export async function openExistingFile(uri: string): Promise<RandomAccessFile> {
  const file = new File(uri) as unknown as NativeFsFile;
  if (!file.exists) {
    throw new Error("Media file is missing");
  }
  return new ExpoRandomAccessFile(file, file.size ?? 0);
}

export async function createOutputFile(
  attachmentId: string,
  extension: string,
  size: number,
): Promise<{ file: RandomAccessFile; uri: string }> {
  mediaDir();
  const file = new File(Paths.document, "gdot-media", `${attachmentId}.${extension}`) as unknown as NativeFsFile;
  if (file.exists) {
    file.delete();
  }
  file.create();
  if (size > 0) {
    const handle = file.open();
    try {
      handle.offset = Math.max(0, size - 1);
      handle.writeBytes(new Uint8Array([0]));
    } finally {
      handle.close();
    }
  }
  return { file: new ExpoRandomAccessFile(file, size), uri: file.uri };
}

export async function deleteLocalFile(uri: string): Promise<void> {
  try {
    const file = new File(uri) as unknown as NativeFsFile;
    if (file.exists) file.delete();
  } catch {
    /* ignore */
  }
}
