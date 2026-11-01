import type { IDatabase } from "./database-types";
import type {
  IPendingOutgoingSendStore,
  PendingOutgoingEnqueue,
  PendingOutgoingSend,
} from "@/lib/session/send-retry";

type Row = {
  client_message_id: string;
  local_message_id: string;
  conversation_id: string;
  plaintext: string;
  created_at: number;
  next_attempt_at: number;
  attempt_count: number;
  last_error: string | null;
};

function mapRow(row: Row): PendingOutgoingSend {
  return {
    clientMessageId: row.client_message_id,
    localMessageId: row.local_message_id,
    conversationId: row.conversation_id,
    plaintext: row.plaintext,
    createdAt: row.created_at,
    nextAttemptAt: row.next_attempt_at,
    attemptCount: row.attempt_count,
    lastError: row.last_error ?? undefined,
  };
}

export class PendingOutgoingSendStore implements IPendingOutgoingSendStore {
  constructor(private readonly db: IDatabase) {}

  async enqueue(entry: PendingOutgoingEnqueue): Promise<void> {
    await this.db.run(
      `INSERT INTO pending_outgoing_sends (
         client_message_id, local_message_id, conversation_id, plaintext,
         created_at, next_attempt_at, attempt_count, last_error
       ) VALUES (?,?,?,?,?,?,0,NULL)
       ON CONFLICT(client_message_id) DO NOTHING`,
      [
        entry.clientMessageId,
        entry.localMessageId,
        entry.conversationId,
        entry.plaintext,
        entry.createdAt,
        entry.nextAttemptAt,
      ],
    );
  }

  async listDue(now: number, limit: number): Promise<PendingOutgoingSend[]> {
    const rows = await this.db.getAll<Row>(
      `SELECT * FROM pending_outgoing_sends
       WHERE next_attempt_at <= ?
       ORDER BY next_attempt_at ASC, created_at ASC
       LIMIT ?`,
      [now, limit],
    );
    return rows.map(mapRow);
  }

  async markAttempt(
    clientMessageId: string,
    nextAttemptAt: number,
    attemptCount: number,
    error: string | undefined,
  ): Promise<void> {
    await this.db.run(
      `UPDATE pending_outgoing_sends
       SET next_attempt_at = ?, attempt_count = ?, last_error = ?
       WHERE client_message_id = ?`,
      [nextAttemptAt, attemptCount, error ?? null, clientMessageId],
    );
  }

  async remove(clientMessageIds: string[]): Promise<void> {
    for (const id of clientMessageIds) {
      await this.db.run(
        `DELETE FROM pending_outgoing_sends WHERE client_message_id = ?`,
        [id],
      );
    }
  }

  async trimOldest(maxKeep: number): Promise<void> {
    const countRow = await this.db.getFirst<{ c: number }>(
      `SELECT COUNT(*) as c FROM pending_outgoing_sends`,
    );
    const count = countRow?.c ?? 0;
    if (count <= maxKeep) return;
    const drop = count - maxKeep;
    await this.db.run(
      `DELETE FROM pending_outgoing_sends WHERE client_message_id IN (
         SELECT client_message_id FROM pending_outgoing_sends
         ORDER BY created_at ASC
         LIMIT ?
       )`,
      [drop],
    );
  }

  async get(clientMessageId: string): Promise<PendingOutgoingSend | null> {
    const row = await this.db.getFirst<Row>(
      `SELECT * FROM pending_outgoing_sends WHERE client_message_id = ?`,
      [clientMessageId],
    );
    return row ? mapRow(row) : null;
  }
}
