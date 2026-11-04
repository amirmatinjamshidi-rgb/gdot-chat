import { describe, expect, it, vi } from "vitest";

import { MemoryEnvelopeAttemptStore } from "@/lib/db/envelope-attempt-store";
import { MemoryEnvelopeQuarantineStore } from "@/lib/db/envelope-quarantine-store";
import { MemoryOutboxStore } from "@/lib/db/outbox-store";
import { DbLockedError } from "@/lib/db/db-errors";
import {
  MemoryConversationStore,
  MemoryIdentityStore,
  MemoryMessageStore,
  MemoryReactionStore,
  MemorySessionStore,
} from "@/lib/test/memory-stores";
import { SyncService } from "@/lib/session/sync-service";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("SyncService stop during start / lock", () => {
  it("awaits in-flight start and treats DB_LOCKED replenish as quiet cancel", async () => {
    let replenishStarted = false;
    let replenishFinished = false;

    const disconnect = vi.fn(async () => undefined);
    const abortBackground = vi.fn(async () => undefined);

    const sync = new SyncService(
      {
        abortBackground,
        send: async () => ({ envelopeId: crypto.randomUUID() }),
        getPending: async () => [],
        ack: async () => undefined,
      } as never,
      {
        runWithTransportPaused: async <T>(fn: () => Promise<T>) => fn(),
        setPreKeysLowHandler: () => undefined,
        setSessionResetHandler: () => undefined,
        setGroupMembershipChangedHandler: () => undefined,
        setEnvelopeHandler: () => undefined,
        setConnectionHandler: () => undefined,
        disconnect,
        isConnected: () => false,
        connect: async () => undefined,
      } as never,
      {
        replenishLocalPreKeysIfNeeded: async () => {
          replenishStarted = true;
          await delay(40);
          replenishFinished = true;
          throw new DbLockedError();
        },
      } as never,
      new MemoryMessageStore(),
      new MemoryConversationStore(),
      new MemoryIdentityStore(),
      {
        getAccessToken: async () => "test-token",
        getDeviceId: async () => "dev",
        getUserId: () => "user",
        clearSessionExpired: async () => undefined,
      } as never,
      new MemoryReactionStore(),
      null,
      {
        quarantineStore: new MemoryEnvelopeQuarantineStore(),
        attemptStore: new MemoryEnvelopeAttemptStore(),
        sessionResetApi: { request: async () => undefined } as never,
        sessionStore: new MemorySessionStore(),
        outboxStore: new MemoryOutboxStore(),
      },
    );

    const startPromise = sync.start();
    await delay(5);
    expect(replenishStarted).toBe(true);
    await sync.stop();
    await expect(startPromise).resolves.toBeUndefined();
    expect(replenishFinished).toBe(true);
    expect(abortBackground).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });
});
