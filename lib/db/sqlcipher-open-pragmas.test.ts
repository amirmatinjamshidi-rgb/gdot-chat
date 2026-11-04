import { beforeEach, describe, expect, it, vi } from "vitest";

import { sqlcipherPostKeyPragmas } from "@/lib/db/sqlcipher-open-pragmas";

describe("sqlcipherPostKeyPragmas", () => {
  it("includes secure_delete = ON on every open pragma list", () => {
    const pragmas = sqlcipherPostKeyPragmas(5000);
    expect(pragmas).toContain("PRAGMA secure_delete = ON");
    expect(pragmas).toContain("PRAGMA foreign_keys = ON");
    expect(pragmas).toContain("PRAGMA cipher_memory_security = ON");
    expect(pragmas).toContain("PRAGMA busy_timeout = 5000");
  });
});

describe("SqlCipherDatabase.open issues secure_delete", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("execAsync receives PRAGMA secure_delete = ON after key", async () => {
    const execAsync = vi.fn(async (_sql: string) => undefined);
    const getFirstAsync = vi.fn(async (sql: string) => {
      if (String(sql).includes("secure_delete")) return { secure_delete: 1 };
      return { c: 0 };
    });
    const getAllAsync = vi.fn(async () => []);
    const runAsync = vi.fn(async () => ({
      changes: 0,
      lastInsertRowId: 0,
    }));
    const closeAsync = vi.fn(async () => undefined);

    vi.doMock("expo-sqlite", () => ({
      openDatabaseAsync: vi.fn(async () => ({
        execAsync,
        getFirstAsync,
        getAllAsync,
        runAsync,
        closeAsync,
      })),
      deleteDatabaseAsync: vi.fn(async () => undefined),
    }));

    vi.doMock("@/lib/db/migration-runner", () => ({
      MigrationRunner: class {
        async runMigrations() {
          return;
        }
      },
    }));

    const { SqlCipherDatabase } = await import("@/lib/db/database.native");
    const db = new SqlCipherDatabase();
    await db.open("test-passphrase");

    const executed = execAsync.mock.calls.map((c) => String(c[0]));
    const keyIdx = executed.findIndex((s) => s.startsWith("PRAGMA key"));
    const secureIdx = executed.findIndex(
      (s) => s === "PRAGMA secure_delete = ON",
    );
    expect(keyIdx).toBeGreaterThanOrEqual(0);
    expect(secureIdx).toBeGreaterThan(keyIdx);
    await db.close();
  });
});
