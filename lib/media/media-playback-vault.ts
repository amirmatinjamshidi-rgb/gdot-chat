/**
 * Materializes plaintext media for AV playback into an ephemeral cache.
 * Durable Documents/gdot-media holds only ciphertext (.genc). On lock, wipe
 * all plaintext temps so nothing readable remains outside SQLCipher.
 */
import type { LocalAttachment } from "@/lib/db/types";
import {
  decryptFixedSlotCipherToPlaintext,
  decryptPackedCipherToPlaintext,
  isAtRestUri,
  MEDIA_AT_REST_EXT,
  unwrapLocalFileV1,
  wrapLocalFileV1,
} from "@/lib/media/media-at-rest";
import { extensionForMime } from "@/lib/media/random-access-file";

export type VaultFileAccess = {
  readFileBytes(uri: string): Promise<Uint8Array>;
  writeFileBytes(uri: string, bytes: Uint8Array): Promise<void>;
  deleteFile(uri: string): Promise<void>;
  ensureDir(kind: "durable" | "tmp"): Promise<void>;
  durableUri(attachmentId: string, ext?: string): string;
  tmpUri(attachmentId: string, ext: string): string;
  listDurableFiles(): Promise<string[]>;
  listTmpFiles(): Promise<string[]>;
  wipeTmp(): Promise<number>;
};

export type MediaPlaybackVaultDeps = {
  files: VaultFileAccess;
};

export class MediaPlaybackVault {
  private readonly playbackByAttachment = new Map<string, string>();
  private readonly files: VaultFileAccess;

  constructor(deps: MediaPlaybackVaultDeps) {
    this.files = deps.files;
  }

  /** Clear in-memory playback map and delete plaintext temps (call on lock). */
  async clearOnLock(): Promise<void> {
    this.playbackByAttachment.clear();
    await this.files.wipeTmp();
  }

  getCachedPlaybackUri(attachmentId: string): string | undefined {
    return this.playbackByAttachment.get(attachmentId);
  }

  /**
   * Ensure a plaintext file exists for AV playback. Returns undefined when the
   * durable ciphertext is missing or the attachment is not at-rest encrypted.
   */
  async ensurePlaybackUri(row: LocalAttachment): Promise<string | undefined> {
    const cached = this.playbackByAttachment.get(row.attachmentId);
    if (cached) return cached;

    if (!row.localUri) return undefined;

    // Legacy plaintext in Documents — migrate then play from tmp.
    if (!row.atRestEncrypted && !isAtRestUri(row.localUri)) {
      await this.migratePlaintextFile(row);
    }

    const durable =
      row.localUri && isAtRestUri(row.localUri)
        ? row.localUri
        : this.files.durableUri(row.attachmentId, MEDIA_AT_REST_EXT);

    let packed: Uint8Array;
    try {
      packed = await this.files.readFileBytes(durable);
    } catch {
      return undefined;
    }

    let plain: Uint8Array;
    try {
      plain = decryptPackedCipherToPlaintext({
        key: row.mediaKey,
        noncePrefix: row.noncePrefix,
        attachmentId: row.attachmentId,
        plainSize: row.plainSizeBytes,
        chunkCount: row.chunkCount,
        packed,
      });
    } catch {
      try {
        plain = decryptFixedSlotCipherToPlaintext({
          key: row.mediaKey,
          noncePrefix: row.noncePrefix,
          attachmentId: row.attachmentId,
          plainSize: row.plainSizeBytes,
          chunkSize: row.chunkSize,
          chunkCount: row.chunkCount,
          fileBytes: packed,
        });
      } catch {
        // Legacy whole-file wrap migration format.
        plain = unwrapLocalFileV1({
          key: row.mediaKey,
          attachmentId: row.attachmentId,
          wrapped: packed,
        });
      }
    }

    await this.files.ensureDir("tmp");
    const ext = extensionForMime(row.mimeType);
    const tmp = this.files.tmpUri(row.attachmentId, ext);
    await this.files.writeFileBytes(tmp, plain);
    // Scrub plaintext buffer reference eagerly where possible.
    plain.fill(0);
    this.playbackByAttachment.set(row.attachmentId, tmp);
    return tmp;
  }

  /**
   * Persist packed wire ciphertext under Documents/gdot-media/{id}.genc.
   * Returns the durable URI.
   */
  async persistPackedCipher(
    attachmentId: string,
    packed: Uint8Array,
  ): Promise<string> {
    await this.files.ensureDir("durable");
    const uri = this.files.durableUri(attachmentId, MEDIA_AT_REST_EXT);
    await this.files.writeFileBytes(uri, packed);
    return uri;
  }

  /** Encrypt a legacy plaintext Documents file in place → .genc, delete plain. */
  async migratePlaintextFile(row: LocalAttachment): Promise<string | null> {
    if (!row.localUri || isAtRestUri(row.localUri)) return row.localUri ?? null;
    let plain: Uint8Array;
    try {
      plain = await this.files.readFileBytes(row.localUri);
    } catch {
      return null;
    }
    // Prefer packed wire chunks when sizes match attachment metadata.
    let durableBytes: Uint8Array;
    try {
      const { encryptPlaintextToPackedCipher } = await import(
        "@/lib/media/media-at-rest"
      );
      durableBytes = encryptPlaintextToPackedCipher({
        key: row.mediaKey,
        noncePrefix: row.noncePrefix,
        attachmentId: row.attachmentId,
        plainSize: row.plainSizeBytes,
        chunkSize: row.chunkSize,
        chunkCount: row.chunkCount,
        plaintext: plain,
      });
    } catch {
      durableBytes = wrapLocalFileV1({
        key: row.mediaKey,
        attachmentId: row.attachmentId,
        plaintext: plain,
      });
    }
    const durable = await this.persistPackedCipher(row.attachmentId, durableBytes);
    plain.fill(0);
    try {
      await this.files.deleteFile(row.localUri);
    } catch {
      /* best-effort secure delete of legacy plaintext */
    }
    return durable;
  }
}

/** In-memory vault file access for unit tests. */
export class MemoryVaultFileAccess implements VaultFileAccess {
  readonly durable = new Map<string, Uint8Array>();
  readonly tmp = new Map<string, Uint8Array>();

  async readFileBytes(uri: string): Promise<Uint8Array> {
    const b = this.durable.get(uri) ?? this.tmp.get(uri);
    if (!b) throw new Error(`missing ${uri}`);
    return new Uint8Array(b);
  }

  async writeFileBytes(uri: string, bytes: Uint8Array): Promise<void> {
    const copy = new Uint8Array(bytes);
    if (uri.includes("/tmp/") || uri.includes("gdot-media-tmp")) {
      this.tmp.set(uri, copy);
    } else {
      this.durable.set(uri, copy);
    }
  }

  async deleteFile(uri: string): Promise<void> {
    this.durable.delete(uri);
    this.tmp.delete(uri);
  }

  async ensureDir(_kind: "durable" | "tmp"): Promise<void> {}

  durableUri(attachmentId: string, ext = MEDIA_AT_REST_EXT): string {
    return `memory://gdot-media/${attachmentId}.${ext}`;
  }

  tmpUri(attachmentId: string, ext: string): string {
    return `memory://gdot-media-tmp/${attachmentId}.${ext}`;
  }

  async listDurableFiles(): Promise<string[]> {
    return [...this.durable.keys()];
  }

  async listTmpFiles(): Promise<string[]> {
    return [...this.tmp.keys()];
  }

  async wipeTmp(): Promise<number> {
    const n = this.tmp.size;
    this.tmp.clear();
    return n;
  }
}
