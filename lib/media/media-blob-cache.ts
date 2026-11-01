import type { IDatabase } from "@/lib/db/database-types";
import {
  MEDIA_BLOB_CACHE_MAX_BYTES,
  MEDIA_BLOB_CACHE_TTL_MS,
} from "./media-blob-constants";

export type MediaBlobEntry = {
  clientMessageId: string;
  ciphertext: Uint8Array;
  createdAt: number;
  expiresAt: number;
  byteLength: number;
};

export interface IMediaBlobCache {
  put(
    clientMessageId: string,
    ciphertext: Uint8Array,
    now: number,
    opts?: { ttlMs?: number; maxBytes?: number },
  ): Promise<"stored" | "over_cap">;
  get(clientMessageId: string, now: number): Promise<MediaBlobEntry | null>;
  delete(clientMessageId: string): Promise<void>;
  purgeExpired(now: number): Promise<number>;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** In-memory blob cache for tests (injected clock via caller). */
export class MemoryMediaBlobCache implements IMediaBlobCache {
  private readonly rows = new Map<string, MediaBlobEntry>();

  async put(
    clientMessageId: string,
    ciphertext: Uint8Array,
    now: number,
    opts?: { ttlMs?: number; maxBytes?: number },
  ): Promise<"stored" | "over_cap"> {
    const max = opts?.maxBytes ?? MEDIA_BLOB_CACHE_MAX_BYTES;
    if (ciphertext.byteLength > max) return "over_cap";
    const ttl = opts?.ttlMs ?? MEDIA_BLOB_CACHE_TTL_MS;
    this.rows.set(clientMessageId, {
      clientMessageId,
      ciphertext: new Uint8Array(ciphertext),
      createdAt: now,
      expiresAt: now + ttl,
      byteLength: ciphertext.byteLength,
    });
    return "stored";
  }

  async get(clientMessageId: string, now: number): Promise<MediaBlobEntry | null> {
    const row = this.rows.get(clientMessageId);
    if (!row) return null;
    if (row.expiresAt <= now) {
      this.rows.delete(clientMessageId);
      return null;
    }
    return row;
  }

  async delete(clientMessageId: string): Promise<void> {
    this.rows.delete(clientMessageId);
  }

  async purgeExpired(now: number): Promise<number> {
    let n = 0;
    for (const [id, row] of this.rows) {
      if (row.expiresAt <= now) {
        this.rows.delete(id);
        n++;
      }
    }
    return n;
  }
}

type BlobRow = {
  client_message_id: string;
  ciphertext_b64: string;
  created_at: number;
  expires_at: number;
  byte_length: number;
};

export class MediaBlobCacheStore implements IMediaBlobCache {
  constructor(private readonly db: IDatabase) {}

  async put(
    clientMessageId: string,
    ciphertext: Uint8Array,
    now: number,
    opts?: { ttlMs?: number; maxBytes?: number },
  ): Promise<"stored" | "over_cap"> {
    const max = opts?.maxBytes ?? MEDIA_BLOB_CACHE_MAX_BYTES;
    if (ciphertext.byteLength > max) return "over_cap";
    const ttl = opts?.ttlMs ?? MEDIA_BLOB_CACHE_TTL_MS;
    await this.db.run(
      `INSERT INTO media_blob_cache (
         client_message_id, ciphertext_b64, created_at, expires_at, byte_length
       ) VALUES (?,?,?,?,?)
       ON CONFLICT(client_message_id) DO UPDATE SET
         ciphertext_b64 = excluded.ciphertext_b64,
         created_at = excluded.created_at,
         expires_at = excluded.expires_at,
         byte_length = excluded.byte_length`,
      [
        clientMessageId,
        bytesToBase64(ciphertext),
        now,
        now + ttl,
        ciphertext.byteLength,
      ],
    );
    return "stored";
  }

  async get(clientMessageId: string, now: number): Promise<MediaBlobEntry | null> {
    const row = await this.db.getFirst<BlobRow>(
      `SELECT * FROM media_blob_cache WHERE client_message_id = ?`,
      [clientMessageId],
    );
    if (!row) return null;
    if (row.expires_at <= now) {
      await this.delete(clientMessageId);
      return null;
    }
    return {
      clientMessageId: row.client_message_id,
      ciphertext: base64ToBytes(row.ciphertext_b64),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      byteLength: row.byte_length,
    };
  }

  async delete(clientMessageId: string): Promise<void> {
    await this.db.run(`DELETE FROM media_blob_cache WHERE client_message_id = ?`, [
      clientMessageId,
    ]);
  }

  async purgeExpired(now: number): Promise<number> {
    const result = await this.db.run(
      `DELETE FROM media_blob_cache WHERE expires_at <= ?`,
      [now],
    );
    return result.changes;
  }
}
