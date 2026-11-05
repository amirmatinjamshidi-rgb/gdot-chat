/**
 * Registers at-rest .genc attachments with the native streaming decryptor.
 * Durable Documents/gdot-media holds only ciphertext. No plaintext is written
 * to disk; keys are passed to native only for active playback and cleared on lock.
 */
import type { LocalAttachment } from "@/lib/db/types";
import {
  encryptPlaintextToPackedCipher,
  isAtRestUri,
  MEDIA_AT_REST_EXT,
  unwrapLocalFileV1,
  wrapLocalFileV1,
} from "@/lib/media/media-at-rest";
import { detectGencFormat, type GencFormat } from "@/lib/media/genc-range-map";

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

export type NativePlaybackBridge = {
  registerSession(params: {
    attachmentId: string;
    fileUri: string;
    keyBase64: string;
    noncePrefixBase64: string;
    plainSize: number;
    chunkSize: number;
    chunkCount: number;
    mimeType: string;
    format: "fixed-slot" | "packed";
  }): void;
  unregisterSession(attachmentId: string): void;
  clearAll(): void;
};

export type MediaPlaybackVaultDeps = {
  files: VaultFileAccess;
  native?: NativePlaybackBridge | null;
  /** Encode bytes to standard base64 for native. */
  bytesToBase64?: (bytes: Uint8Array) => string;
};

function defaultBytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

export class MediaPlaybackVault {
  private readonly registered = new Set<string>();
  private readonly files: VaultFileAccess;
  private readonly native: NativePlaybackBridge | null;
  private readonly bytesToBase64: (bytes: Uint8Array) => string;

  constructor(deps: MediaPlaybackVaultDeps) {
    this.files = deps.files;
    this.native = deps.native ?? null;
    this.bytesToBase64 = deps.bytesToBase64 ?? defaultBytesToBase64;
  }

  /** Clear native keys/sessions and delete any leftover plaintext temps. */
  async clearOnLock(): Promise<void> {
    this.registered.clear();
    try {
      this.native?.clearAll();
    } catch {
      /* native may be unavailable in tests/web */
    }
    await this.files.wipeTmp();
  }

  /**
   * @deprecated Temp-file playback removed. Prefer registerForPlayback.
   * Kept as a no-op-returning-undefined so call sites compile during migration.
   */
  async ensurePlaybackUri(_row: LocalAttachment): Promise<string | undefined> {
    return undefined;
  }

  getCachedPlaybackUri(_attachmentId: string): string | undefined {
    return undefined;
  }

  isRegistered(attachmentId: string): boolean {
    return this.registered.has(attachmentId);
  }

  /**
   * Register attachment with native streaming decryptor. Converts legacy
   * local-wrap files to packed ciphertext first. Returns true when ready.
   */
  async registerForPlayback(row: LocalAttachment): Promise<boolean> {
    if (this.registered.has(row.attachmentId) && this.native) {
      return true;
    }
    if (!row.localUri) return false;

    if (!row.atRestEncrypted && !isAtRestUri(row.localUri)) {
      await this.migratePlaintextFile(row);
    }

    let durable =
      row.localUri && isAtRestUri(row.localUri)
        ? row.localUri
        : this.files.durableUri(row.attachmentId, MEDIA_AT_REST_EXT);

    let fileBytes: Uint8Array;
    try {
      fileBytes = await this.files.readFileBytes(durable);
    } catch {
      return false;
    }

    let format: GencFormat = detectGencFormat(
      fileBytes,
      row.chunkCount,
      row.plainSizeBytes,
      row.chunkSize,
    );

    if (format === "local-wrap") {
      // Convert legacy whole-file wrap → packed wire chunks (still ciphertext on disk).
      let plain: Uint8Array;
      try {
        plain = unwrapLocalFileV1({
          key: row.mediaKey,
          attachmentId: row.attachmentId,
          wrapped: fileBytes,
        });
      } catch {
        return false;
      }
      const packed = encryptPlaintextToPackedCipher({
        key: row.mediaKey,
        noncePrefix: row.noncePrefix,
        attachmentId: row.attachmentId,
        plainSize: row.plainSizeBytes,
        chunkSize: row.chunkSize,
        chunkCount: row.chunkCount,
        plaintext: plain,
      });
      plain.fill(0);
      durable = await this.persistPackedCipher(row.attachmentId, packed);
      fileBytes = packed;
      format = "packed";
    }

    if (!this.native) {
      // Web / unit tests without native: mark registered for UI gated paths.
      this.registered.add(row.attachmentId);
      return true;
    }

    try {
      this.native.registerSession({
        attachmentId: row.attachmentId,
        fileUri: durable,
        keyBase64: this.bytesToBase64(row.mediaKey),
        noncePrefixBase64: this.bytesToBase64(row.noncePrefix),
        plainSize: row.plainSizeBytes,
        chunkSize: row.chunkSize,
        chunkCount: row.chunkCount,
        mimeType: row.mimeType,
        format: format === "packed" ? "packed" : "fixed-slot",
      });
      this.registered.add(row.attachmentId);
      return true;
    } catch {
      return false;
    }
  }

  async unregister(attachmentId: string): Promise<void> {
    this.registered.delete(attachmentId);
    try {
      this.native?.unregisterSession(attachmentId);
    } catch {
      /* ignore */
    }
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

  /**
   * Best-effort delete of a plaintext source after durable .genc is written.
   * Skips when source is missing, identical to durable, or already a .genc URI.
   */
  async scrubPlaintextSource(
    sourceUri: string | undefined | null,
    durableUri: string,
  ): Promise<void> {
    if (!sourceUri || sourceUri === durableUri || isAtRestUri(sourceUri)) return;
    try {
      await this.files.deleteFile(sourceUri);
    } catch {
      /* best-effort — recorder/cache paths may already be gone */
    }
  }

  /** Read durable packed ciphertext bytes (for outbox resume without plaintext). */
  async readDurablePacked(uri: string): Promise<Uint8Array> {
    return this.files.readFileBytes(uri);
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
    let durableBytes: Uint8Array;
    try {
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
      /* best-effort */
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
