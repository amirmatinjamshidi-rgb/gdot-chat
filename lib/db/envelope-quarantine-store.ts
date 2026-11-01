import { randomUUID } from "@/lib/crypto/random-id";
import type { IDatabase } from "./database-types";

export type QuarantineKind = "identity_key" | "message_request";
export type QuarantineStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "expired"
  | "processed";

export type QuarantinedEnvelope = {
  id: string;
  serverEnvelopeId: string;
  senderDeviceId: string;
  senderUserId?: string;
  senderUsername?: string;
  conversationId?: string;
  kind: QuarantineKind;
  messageType: number;
  ciphertext: Uint8Array;
  errorClass: string;
  errorName: string;
  createdAt: number;
  expiresAt?: number;
  status: QuarantineStatus;
  updatedAt: number;
};

export type InsertQuarantineInput = {
  serverEnvelopeId: string;
  senderDeviceId: string;
  senderUserId?: string;
  senderUsername?: string;
  conversationId?: string;
  kind: QuarantineKind;
  messageType: number;
  ciphertext: Uint8Array;
  errorClass: string;
  errorName: string;
  createdAt: number;
  expiresAt?: number;
};

export interface IEnvelopeQuarantineStore {
  upsertPending(input: InsertQuarantineInput): Promise<QuarantinedEnvelope>;
  getByServerEnvelopeId(
    serverEnvelopeId: string,
  ): Promise<QuarantinedEnvelope | null>;
  listPendingMessageRequests(): Promise<QuarantinedEnvelope[]>;
  listPendingIdentityForPeer(peerUserId: string): Promise<QuarantinedEnvelope[]>;
  updateStatus(
    id: string,
    status: QuarantineStatus,
    updatedAt: number,
  ): Promise<void>;
  expireBefore(now: number): Promise<number>;
  delete(id: string): Promise<void>;
}

type Row = {
  id: string;
  server_envelope_id: string;
  sender_device_id: string;
  sender_user_id: string | null;
  sender_username: string | null;
  conversation_id: string | null;
  kind: string;
  message_type: number;
  ciphertext: Uint8Array;
  error_class: string;
  error_name: string;
  created_at: number;
  expires_at: number | null;
  status: string;
  updated_at: number;
};

function mapRow(row: Row): QuarantinedEnvelope {
  return {
    id: row.id,
    serverEnvelopeId: row.server_envelope_id,
    senderDeviceId: row.sender_device_id,
    senderUserId: row.sender_user_id ?? undefined,
    senderUsername: row.sender_username ?? undefined,
    conversationId: row.conversation_id ?? undefined,
    kind: row.kind as QuarantineKind,
    messageType: row.message_type,
    ciphertext: row.ciphertext,
    errorClass: row.error_class,
    errorName: row.error_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? undefined,
    status: row.status as QuarantineStatus,
    updatedAt: row.updated_at,
  };
}

export class EnvelopeQuarantineStore implements IEnvelopeQuarantineStore {
  constructor(private readonly db: IDatabase) {}

  async upsertPending(input: InsertQuarantineInput): Promise<QuarantinedEnvelope> {
    const existing = await this.getByServerEnvelopeId(input.serverEnvelopeId);
    if (existing) {
      return existing;
    }
    const row: QuarantinedEnvelope = {
      id: randomUUID(),
      serverEnvelopeId: input.serverEnvelopeId,
      senderDeviceId: input.senderDeviceId,
      senderUserId: input.senderUserId,
      senderUsername: input.senderUsername,
      conversationId: input.conversationId,
      kind: input.kind,
      messageType: input.messageType,
      ciphertext: input.ciphertext,
      errorClass: input.errorClass,
      errorName: input.errorName,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      status: "pending",
      updatedAt: input.createdAt,
    };
    await this.db.run(
      `INSERT INTO envelope_quarantine (
         id, server_envelope_id, sender_device_id, sender_user_id, sender_username,
         conversation_id, kind, message_type, ciphertext, error_class, error_name,
         created_at, expires_at, status, updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        row.id,
        row.serverEnvelopeId,
        row.senderDeviceId,
        row.senderUserId ?? null,
        row.senderUsername ?? null,
        row.conversationId ?? null,
        row.kind,
        row.messageType,
        row.ciphertext,
        row.errorClass,
        row.errorName,
        row.createdAt,
        row.expiresAt ?? null,
        row.status,
        row.updatedAt,
      ],
    );
    return row;
  }

  async getByServerEnvelopeId(
    serverEnvelopeId: string,
  ): Promise<QuarantinedEnvelope | null> {
    const row = await this.db.getFirst<Row>(
      `SELECT * FROM envelope_quarantine WHERE server_envelope_id = ?`,
      [serverEnvelopeId],
    );
    return row ? mapRow(row) : null;
  }

  async listPendingMessageRequests(): Promise<QuarantinedEnvelope[]> {
    const rows = await this.db.getAll<Row>(
      `SELECT * FROM envelope_quarantine
       WHERE status = 'pending' AND kind = 'message_request'
       ORDER BY created_at ASC`,
    );
    return rows.map(mapRow);
  }

  async listPendingIdentityForPeer(
    peerUserId: string,
  ): Promise<QuarantinedEnvelope[]> {
    const rows = await this.db.getAll<Row>(
      `SELECT * FROM envelope_quarantine
       WHERE status = 'pending' AND kind = 'identity_key' AND sender_user_id = ?
       ORDER BY created_at ASC`,
      [peerUserId],
    );
    return rows.map(mapRow);
  }

  async updateStatus(
    id: string,
    status: QuarantineStatus,
    updatedAt: number,
  ): Promise<void> {
    await this.db.run(
      `UPDATE envelope_quarantine SET status = ?, updated_at = ? WHERE id = ?`,
      [status, updatedAt, id],
    );
  }

  async expireBefore(now: number): Promise<number> {
    const result = await this.db.run(
      `UPDATE envelope_quarantine
       SET status = 'expired', updated_at = ?, ciphertext = X''
       WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < ?`,
      [now, now],
    );
    return result.changes ?? 0;
  }

  async delete(id: string): Promise<void> {
    await this.db.run(`DELETE FROM envelope_quarantine WHERE id = ?`, [id]);
  }
}

/** In-memory store for unit/E2E tests. */
export class MemoryEnvelopeQuarantineStore implements IEnvelopeQuarantineStore {
  private byId = new Map<string, QuarantinedEnvelope>();
  private byServer = new Map<string, string>();

  async upsertPending(input: InsertQuarantineInput): Promise<QuarantinedEnvelope> {
    const existing = await this.getByServerEnvelopeId(input.serverEnvelopeId);
    if (existing) return existing;
    const row: QuarantinedEnvelope = {
      id: randomUUID(),
      ...input,
      ciphertext: new Uint8Array(input.ciphertext),
      status: "pending",
      updatedAt: input.createdAt,
    };
    this.byId.set(row.id, row);
    this.byServer.set(row.serverEnvelopeId, row.id);
    return { ...row, ciphertext: new Uint8Array(row.ciphertext) };
  }

  async getByServerEnvelopeId(
    serverEnvelopeId: string,
  ): Promise<QuarantinedEnvelope | null> {
    const id = this.byServer.get(serverEnvelopeId);
    if (!id) return null;
    const row = this.byId.get(id);
    return row
      ? { ...row, ciphertext: new Uint8Array(row.ciphertext) }
      : null;
  }

  async listPendingMessageRequests(): Promise<QuarantinedEnvelope[]> {
    return [...this.byId.values()]
      .filter((r) => r.status === "pending" && r.kind === "message_request")
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({ ...r, ciphertext: new Uint8Array(r.ciphertext) }));
  }

  async listPendingIdentityForPeer(
    peerUserId: string,
  ): Promise<QuarantinedEnvelope[]> {
    return [...this.byId.values()]
      .filter(
        (r) =>
          r.status === "pending" &&
          r.kind === "identity_key" &&
          r.senderUserId === peerUserId,
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({ ...r, ciphertext: new Uint8Array(r.ciphertext) }));
  }

  async updateStatus(
    id: string,
    status: QuarantineStatus,
    updatedAt: number,
  ): Promise<void> {
    const row = this.byId.get(id);
    if (!row) return;
    row.status = status;
    row.updatedAt = updatedAt;
    if (status === "rejected" || status === "expired") {
      row.ciphertext = new Uint8Array(0);
    }
  }

  async expireBefore(now: number): Promise<number> {
    let n = 0;
    for (const row of this.byId.values()) {
      if (
        row.status === "pending" &&
        row.expiresAt != null &&
        row.expiresAt < now
      ) {
        row.status = "expired";
        row.updatedAt = now;
        row.ciphertext = new Uint8Array(0);
        n++;
      }
    }
    return n;
  }

  async delete(id: string): Promise<void> {
    const row = this.byId.get(id);
    if (!row) return;
    this.byId.delete(id);
    this.byServer.delete(row.serverEnvelopeId);
  }
}
