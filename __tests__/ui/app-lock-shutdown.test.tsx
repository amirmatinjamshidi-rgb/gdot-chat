import React, { useEffect } from "react";
import { Text } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";

import { AppLockStore } from "@/lib/session/app-lock-store";
import { runLockShutdown } from "@/lib/session/lock-shutdown";
import { DbLockedError } from "@/lib/db/db-errors";
import { mockAppServices } from "./helpers";

// Use the real AppLockProvider (setup.ts stubs it for other screens).
jest.mock("@/lib/providers/app-lock-provider", () => {
  return jest.requireActual("@/lib/providers/app-lock-provider");
});

jest.mock("@/lib/crypto/init-signal", () => ({
  ensureSignalInitialized: jest.fn(async () => undefined),
}));

import { AppLockProvider, useAppLock } from "@/lib/providers/app-lock-provider";
import { AppServicesProvider } from "@/lib/services/app-services-context";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function Probe({
  onReady,
}: {
  onReady: (api: ReturnType<typeof useAppLock>) => void;
}) {
  const api = useAppLock();
  useEffect(() => {
    onReady(api);
  }, [api, onReady]);
  return <Text>probe</Text>;
}

beforeEach(() => {
  jest.useRealTimers();
});

describe("AppLockProvider lock shutdown vs in-flight sync", () => {
  it("stopSync completes before closeDb; in-flight replenish DB_LOCKED is quiet", async () => {
    const order: string[] = [];
    let releaseStop!: () => void;
    const stopGate = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });

    const appLockStore = new AppLockStore();
    appLockStore.unlock();

    const stop = jest.fn(async () => {
      order.push("stop-start");
      await stopGate;
      order.push("stop-end");
    });
    const close = jest.fn(async () => {
      order.push("close");
    });

    const services = mockAppServices({
      appLockStore: appLockStore as never,
      syncService: { start: jest.fn(async () => undefined), stop } as never,
      db: {
        isOpen: jest.fn(() => true),
        open: jest.fn(async () => undefined),
        close,
        deleteDatabase: jest.fn(async () => undefined),
      } as never,
      kekManager: {
        hasKek: jest.fn(async () => true),
        getLockMode: jest.fn(async () => "pin" as const),
        getPassphraseForDb: jest.fn(async () => "pass"),
        clearCachedPassphrase: jest.fn(),
        hasCachedPassphrase: jest.fn(() => false),
        createKekAfterBiometric: jest.fn(async () => undefined),
        createKekWithPin: jest.fn(async () => undefined),
        wipeKek: jest.fn(async () => undefined),
      } as never,
    });

    let lockApi: ReturnType<typeof useAppLock> | null = null;
    render(
      <AppServicesProvider value={services}>
        <AppLockProvider>
          <Probe
            onReady={(api) => {
              lockApi = api;
            }}
          />
        </AppLockProvider>
      </AppServicesProvider>,
    );

    await waitFor(() => {
      expect(lockApi).toBeTruthy();
    });

    await act(async () => {
      const result = await lockApi!.unlock("12345678");
      expect(result.ok).toBe(true);
    });

    const replenish = (async () => {
      order.push("replenish-start");
      await delay(5);
      throw new DbLockedError();
    })().catch((e) => {
      if (e instanceof DbLockedError) {
        order.push("replenish-quiet");
        return;
      }
      throw e;
    });

    await act(async () => {
      lockApi!.lock();
    });

    await waitFor(() => {
      expect(stop).toHaveBeenCalled();
    });
    expect(order).toContain("stop-start");
    expect(order).not.toContain("close");

    await act(async () => {
      releaseStop();
    });

    await waitFor(() => {
      expect(close).toHaveBeenCalled();
    });
    expect(order.indexOf("stop-end")).toBeLessThan(order.indexOf("close"));

    await expect(replenish).resolves.toBeUndefined();
    expect(order).toContain("replenish-quiet");

    await waitFor(() => {
      expect(lockApi!.isUnlocked).toBe(false);
      expect(lockApi!.dbReady).toBe(false);
    });
  });

  it("runLockShutdown orders stop before close", async () => {
    const order: string[] = [];
    await runLockShutdown({
      stopSync: async () => {
        order.push("stop");
        await delay(10);
      },
      closeDb: async () => {
        order.push("close");
      },
    });
    expect(order).toEqual(["stop", "close"]);
  });
});
