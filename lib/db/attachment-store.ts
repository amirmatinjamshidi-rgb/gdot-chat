import type { IDatabase } from "./database-types";
import type { AttachmentTransferState, LocalAttachment } from "./types";

export interface IAttachmentStore {
  upsert(row: LocalAttachment): Promise<void>;
  get(attachmentId: string): Promise<LocalAttachment | null>;
  getByMessageId(messageId: string): Promise<LocalAttachment | null>;
  listIncomplete(): Promise<LocalAttachment[]>;
  updateTransfer(
    attachmentId: string,
    patch: Partial<
      Pick<
        LocalAttachment,
        | "transferState"
        | "uploadedChunks"
        | "downloadedChunks"
        | "localUri"
        | "chunkSize"
        | "chunkCount"
      >
    >,
  ): Promise<void>;
  delete(attachmentId: string): Promise<void>;
}

type AttachmentRow = {
  attachment_id: string;
  message_id: string;
  kind: string;
  mime_type: string;
  plain_size_bytes: number;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  chunk_size: number;
  chunk_count: number;
  media_key: Uint8Array;
  nonce_prefix: Uint8Array;
  local_uri: string | null;
  source_uri: string | null;
  transfer_state: string;
  uploaded_chunks: string;
  downloaded_chunks: string;
  created_at: number;
  updated_at: number;
  group_id?: string | null;
  at_rest_encrypted?: number | null;
};

function parseIndexes(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === "number");
  } catch {
    return [];
  }
}

function mapRow(row: AttachmentRow): LocalAttachment {
  return {
    attachmentId: row.attachment_id,
    messageId: row.message_id,
    kind: row.kind === "video" ? "video" : "voice",
    mimeType: row.mime_type,
    plainSizeBytes: row.plain_size_bytes,
    durationMs: row.duration_ms ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    chunkSize: row.chunk_size,
    chunkCount: row.chunk_count,
    mediaKey: row.media_key,
    noncePrefix: row.nonce_prefix,
    localUri: row.local_uri ?? undefined,
    sourceUri: row.source_uri ?? undefined,
    groupId: row.group_id ?? undefined,
    atRestEncrypted: (row.at_rest_encrypted ?? 0) === 1,
    transferState: row.transfer_state as AttachmentTransferState,
    uploadedChunks: parseIndexes(row.uploaded_chunks),
    downloadedChunks: parseIndexes(row.downloaded_chunks),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AttachmentStore implements IAttachmentStore {
  constructor(private readonly db: IDatabase) {}

  async upsert(row: LocalAttachment): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO local_attachments (
        attachment_id, message_id, kind, mime_type, plain_size_bytes, duration_ms,
        width, height, chunk_size, chunk_count, media_key, nonce_prefix, local_uri,
        source_uri, transfer_state, uploaded_chunks, downloaded_chunks, created_at, updated_at,
        group_id, at_rest_encrypted
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        row.attachmentId,
        row.messageId,
        row.kind,
        row.mimeType,
        row.plainSizeBytes,
        row.durationMs ?? null,
        row.width ?? null,
        row.height ?? null,
        row.chunkSize,
        row.chunkCount,
        row.mediaKey,
        row.noncePrefix,
        row.localUri ?? null,
        row.sourceUri ?? null,
        row.transferState,
        JSON.stringify(row.uploadedChunks),
        JSON.stringify(row.downloadedChunks),
        row.createdAt,
        row.updatedAt,
        row.groupId ?? null,
        row.atRestEncrypted ? 1 : 0,
      ],
    );
  }

  async get(attachmentId: string): Promise<LocalAttachment | null> {
    const row = await this.db.getFirst<AttachmentRow>(
      `SELECT * FROM local_attachments WHERE attachment_id = ?`,
      [attachmentId],
    );
    return row ? mapRow(row) : null;
  }

  async getByMessageId(messageId: string): Promise<LocalAttachment | null> {
    const row = await this.db.getFirst<AttachmentRow>(
      `SELECT * FROM local_attachments WHERE message_id = ?`,
      [messageId],
    );
    return row ? mapRow(row) : null;
  }

  async listIncomplete(): Promise<LocalAttachment[]> {
    const rows = await this.db.getAll<AttachmentRow>(
      `SELECT * FROM local_attachments WHERE transfer_state IN ('pending','uploading','downloading','ready')`,
    );
    return rows.map(mapRow);
  }

  async updateTransfer(
    attachmentId: string,
    patch: Partial<
      Pick<
        LocalAttachment,
        "transferState" | "uploadedChunks" | "downloadedChunks" | "localUri"
      >
    >,
  ): Promise<void> {
    const current = await this.get(attachmentId);
    if (!current) return;
    await this.upsert({
      ...current,
      ...patch,
      updatedAt: Date.now(),
    });
  }

  async delete(attachmentId: string): Promise<void> {
    await this.db.run(`DELETE FROM local_attachments WHERE attachment_id = ?`, [
      attachmentId,
    ]);
  }
}