import type { IDatabase } from "./database-types";

export type GroupReceiptKind = "delivered" | "read";

export type GroupReceipt = {
  groupId: string;
  clientMessageId: string;
  fromUserId: string;
  fromDeviceId: string;
  kind: GroupReceiptKind;
  at: number;
};

export type GroupReceiptAggregate = {
  deliveredUserIds: string[];
  readUserIds: string[];
  deliveredDeviceCount: number;
  readDeviceCount: number;
};

export interface IGroupReceiptStore {
  upsert(row: GroupReceipt): Promise<void>;
  listForMessage(
    groupId: string,
    clientMessageId: string,
  ): Promise<GroupReceipt[]>;
  aggregate(
    groupId: string,
    clientMessageId: string,
  ): Promise<GroupReceiptAggregate>;
}

type Row = {
  group_id: string;
  client_message_id: string;
  from_user_id: string;
  from_device_id: string;
  kind: string;
  at: number;
};

export class GroupReceiptStore implements IGroupReceiptStore {
  constructor(private readonly db: IDatabase) {}

  async upsert(row: GroupReceipt): Promise<void> {
    await this.db.run(
      `INSERT INTO group_receipts (
         group_id, client_message_id, from_user_id, from_device_id, kind, at
       ) VALUES (?,?,?,?,?,?)
       ON CONFLICT(group_id, client_message_id, from_user_id, from_device_id, kind)
       DO UPDATE SET at=excluded.at`,
      [
        row.groupId,
        row.clientMessageId,
        row.fromUserId,
        row.fromDeviceId,
        row.kind,
        row.at,
      ],
    );
  }

  async listForMessage(
    groupId: string,
    clientMessageId: string,
  ): Promise<GroupReceipt[]> {
    const rows = await this.db.getAll<Row>(
      `SELECT * FROM group_receipts WHERE group_id=? AND client_message_id=?`,
      [groupId, clientMessageId],
    );
    return rows.map((r) => ({
      groupId: r.group_id,
      clientMessageId: r.client_message_id,
      fromUserId: r.from_user_id,
      fromDeviceId: r.from_device_id,
      kind: r.kind as GroupReceiptKind,
      at: r.at,
    }));
  }

  async aggregate(
    groupId: string,
    clientMessageId: string,
  ): Promise<GroupReceiptAggregate> {
    const rows = await this.listForMessage(groupId, clientMessageId);
    const deliveredUsers = new Set<string>();
    const readUsers = new Set<string>();
    let deliveredDeviceCount = 0;
    let readDeviceCount = 0;
    for (const r of rows) {
      if (r.kind === "delivered") {
        deliveredUsers.add(r.fromUserId);
        deliveredDeviceCount += 1;
      } else if (r.kind === "read") {
        readUsers.add(r.fromUserId);
        readDeviceCount += 1;
        deliveredUsers.add(r.fromUserId);
      }
    }
    return {
      deliveredUserIds: [...deliveredUsers],
      readUserIds: [...readUsers],
      deliveredDeviceCount,
      readDeviceCount,
    };
  }
}


export class MemoryGroupReceiptStore implements IGroupReceiptStore {
  private rows: GroupReceipt[] = [];

  async upsert(row: GroupReceipt): Promise<void> {
    const idx = this.rows.findIndex(
      (r) =>
        r.groupId === row.groupId &&
        r.clientMessageId === row.clientMessageId &&
        r.fromUserId === row.fromUserId &&
        r.fromDeviceId === row.fromDeviceId &&
        r.kind === row.kind,
    );
    if (idx >= 0) this.rows[idx] = row;
    else this.rows.push(row);
  }

  async listForMessage(
    groupId: string,
    clientMessageId: string,
  ): Promise<GroupReceipt[]> {
    return this.rows.filter(
      (r) => r.groupId === groupId && r.clientMessageId === clientMessageId,
    );
  }

  async aggregate(
    groupId: string,
    clientMessageId: string,
  ): Promise<GroupReceiptAggregate> {
    const rows = await this.listForMessage(groupId, clientMessageId);
    const deliveredUsers = new Set<string>();
    const readUsers = new Set<string>();
    let deliveredDeviceCount = 0;
    let readDeviceCount = 0;
    for (const r of rows) {
      if (r.kind === "delivered") {
        deliveredUsers.add(r.fromUserId);
        deliveredDeviceCount += 1;
      } else if (r.kind === "read") {
        readUsers.add(r.fromUserId);
        readDeviceCount += 1;
        deliveredUsers.add(r.fromUserId);
      }
    }
    return {
      deliveredUserIds: [...deliveredUsers],
      readUserIds: [...readUsers],
      deliveredDeviceCount,
      readDeviceCount,
    };
  }
}
