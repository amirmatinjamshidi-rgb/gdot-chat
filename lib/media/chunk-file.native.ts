import { Directory, File, Paths } from "expo-file-system";

import { MEDIA_AT_REST_EXT } from "./media-at-rest";
import type { RandomAccessFile } from "./random-access-file";
import type { VaultFileAccess } from "./media-playback-vault";

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
  list?: () => Array<{ uri: string; delete?: () => void } | string>;
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

function mediaTmpDir(): NativeFsDirectory {
  const dir = new Directory(Paths.cache, "gdot-media-tmp") as unknown as NativeFsDirectory;
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

/**
 * Creates a durable at-rest cipher file under Documents/gdot-media/{id}.genc.
 * Size is the cipher-slot capacity (plainSize + chunkCount * tag), not plaintext.
 */
export async function createOutputFile(
  attachmentId: string,
  _extension: string,
  size: number,
): Promise<{ file: RandomAccessFile; uri: string }> {
  mediaDir();
  const file = new File(
    Paths.document,
    "gdot-media",
    `${attachmentId}.${MEDIA_AT_REST_EXT}`,
  ) as unknown as NativeFsFile;
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

/** Legacy helper: create a plaintext-sized file (tests / migration only). */
export async function createPlainOutputFile(
  attachmentId: string,
  extension: string,
  size: number,
): Promise<{ file: RandomAccessFile; uri: string }> {
  mediaDir();
  const file = new File(
    Paths.document,
    "gdot-media",
    `${attachmentId}.${extension}`,
  ) as unknown as NativeFsFile;
  if (file.exists) file.delete();
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

export async function wipeMediaPlaybackTemp(): Promise<number> {
  try {
    const dir = mediaTmpDir();
    const list = dir.list?.() ?? [];
    let n = 0;
    for (const entry of list) {
      try {
        if (typeof entry === "string") {
          const f = new File(entry) as unknown as NativeFsFile;
          if (f.exists) {
            f.delete();
            n++;
          }
        } else if (entry && typeof entry.delete === "function") {
          entry.delete();
          n++;
        } else if (entry && typeof entry.uri === "string") {
          const f = new File(entry.uri) as unknown as NativeFsFile;
          if (f.exists) {
            f.delete();
            n++;
          }
        }
      } catch {
        /* ignore */
      }
    }
    return n;
  } catch {
    return 0;
  }
}

/** Native VaultFileAccess backed by expo-file-system. */
export function createNativeVaultFileAccess(): VaultFileAccess {
  return {
    async readFileBytes(uri: string): Promise<Uint8Array> {
      const file = new File(uri) as unknown as NativeFsFile;
      if (!file.exists) throw new Error("missing file");
      const size = file.size ?? 0;
      const handle = file.open();
      try {
        handle.offset = 0;
        return handle.readBytes(size);
      } finally {
        handle.close();
      }
    },
    async writeFileBytes(uri: string, bytes: Uint8Array): Promise<void> {
      const file = new File(uri) as unknown as NativeFsFile;
      if (file.exists) file.delete();
      // Ensure parent dir
      if (uri.includes("gdot-media-tmp")) mediaTmpDir();
      else mediaDir();
      file.create();
      const handle = file.open();
      try {
        handle.offset = 0;
        handle.writeBytes(bytes);
      } finally {
        handle.close();
      }
    },
    async deleteFile(uri: string): Promise<void> {
      await deleteLocalFile(uri);
    },
    async ensureDir(kind: "durable" | "tmp"): Promise<void> {
      if (kind === "tmp") mediaTmpDir();
      else mediaDir();
    },
    durableUri(attachmentId: string, ext = MEDIA_AT_REST_EXT): string {
      const file = new File(
        Paths.document,
        "gdot-media",
        `${attachmentId}.${ext}`,
      ) as unknown as NativeFsFile;
      return file.uri;
    },
    tmpUri(attachmentId: string, ext: string): string {
      mediaTmpDir();
      const file = new File(
        Paths.cache,
        "gdot-media-tmp",
        `${attachmentId}.${ext}`,
      ) as unknown as NativeFsFile;
      return file.uri;
    },
    async listDurableFiles(): Promise<string[]> {
      const dir = mediaDir();
      const list = dir.list?.() ?? [];
      return list.map((e) => (typeof e === "string" ? e : e.uri));
    },
    async listTmpFiles(): Promise<string[]> {
      const dir = mediaTmpDir();
      const list = dir.list?.() ?? [];
      return list.map((e) => (typeof e === "string" ? e : e.uri));
    },
    async wipeTmp(): Promise<number> {
      return wipeMediaPlaybackTemp();
    },
  };
}
