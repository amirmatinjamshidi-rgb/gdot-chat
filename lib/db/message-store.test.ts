import { describe, expect, test, vi } from "vitest";

import { MESSAGE_LIST_SELECT } from "./message-list-columns";
import { MessageStore } from "./message-store";
import type { IDatabase } from "./database-types";

function makeDb(rows: Record<string, unknown>[] = []) {
  return {
    run: vi.fn(async () => undefined),
    getAll: vi.fn(async () => rows),
    getFirst: vi.fn(async () => rows[0] ?? null),
    withTransaction: vi.fn(async (fn: () => Promise<void>) => fn()),
  } as unknown as IDatabase;
}

describe("MessageStore.listByConversation", () => {
  test("selects list columns only (no SELECT *)", async () => {
    const db = makeDb([]);
    const store = new MessageStore(db);
    await store.listByConversation("c1", 40);
    expect(db.getAll).toHaveBeenCalledOnce();
    const sql = (db.getAll as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain(`SELECT ${MESSAGE_LIST_SELECT}`);
    expect(sql).not.toMatch(/SELECT \*/);
    expect(sql).not.toContain("ciphertext");
    expect(sql).toContain("ORDER BY created_at DESC");
  });

  test("passes before cursor for older pages", async () => {
    const db = makeDb([]);
    const store = new MessageStore(db);
    await store.listByConversation("c1", 30, 1_700_000_000_000);
    const [sql, params] = (db.getAll as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, unknown[]];
    expect(sql).toContain("created_at < ?");
    expect(params).toEqual(["c1", 1_700_000_000_000, 30]);
  });

  test("returns oldest-first mapped rows", async () => {
    const db = makeDb([
      {
        id: "m2",
        client_id: "c2",
        conversation_id: "c1",
        direction: "outgoing",
        kind: "text",
        plaintext: "newer",
        status: "sent",
        sender_device_id: "d",
        sender_user_id: null,
        server_envelope_id: null,
        created_at: 200,
        attachment_id: null,
      },
      {
        id: "m1",
        client_id: "c1",
        conversation_id: "c1",
        direction: "incoming",
        kind: "text",
        plaintext: "older",
        status: "delivered",
        sender_device_id: "d",
        sender_user_id: "u",
        server_envelope_id: "s",
        created_at: 100,
        attachment_id: null,
      },
    ]);
    const store = new MessageStore(db);
    const list = await store.listByConversation("c1", 10);
    expect(list.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(list[0]?.ciphertext).toBeUndefined();
  });

  test("getById still uses full select", async () => {
    const db = makeDb([]);
    const store = new MessageStore(db);
    await store.getById("m1");
    const sql = (db.getFirst as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toMatch(/SELECT \*/);
  });
});
