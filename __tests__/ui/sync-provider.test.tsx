import React, { useState } from "react";
import { Pressable, Text } from "react-native";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { SyncProvider } from "@/lib/providers/sync-provider";
import { mockAppServices, renderWithServices } from "./helpers";

const lockState = {
  isUnlocked: true,
  dbReady: true,
  version: 0,
};

jest.mock("@/lib/providers/app-lock-provider", () => ({
  useAppLock: () => ({
    isUnlocked: lockState.isUnlocked,
    dbReady: lockState.dbReady,
    lockEpoch: lockState.version,
    unlock: jest.fn(async () => ({ ok: true })),
    lock: jest.fn(),
    beginSuppressBackgroundLock: jest.fn(),
    endSuppressBackgroundLock: jest.fn(),
  }),
}));

beforeEach(() => {
  jest.useRealTimers();
});

function Harness({
  services,
}: {
  services: ReturnType<typeof mockAppServices>;
}) {
  const [, setTick] = useState(0);
  return (
    <>
      <Pressable
        accessibilityLabel="relock"
        onPress={() => {
          lockState.isUnlocked = false;
          lockState.dbReady = false;
          lockState.version += 1;
          setTick((n) => n + 1);
        }}
      >
        <Text>relock</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="reunlock"
        onPress={() => {
          lockState.isUnlocked = true;
          lockState.dbReady = true;
          lockState.version += 1;
          setTick((n) => n + 1);
        }}
      >
        <Text>reunlock</Text>
      </Pressable>
      <SyncProvider>
        <Text>child</Text>
      </SyncProvider>
    </>
  );
}

describe("SyncProvider start/stop around lock", () => {
  beforeEach(() => {
    lockState.isUnlocked = true;
    lockState.dbReady = true;
    lockState.version = 0;
  });

  it("starts sync once when unlocked+dbReady, stops on lock, starts once after unlock", async () => {
    const start = jest.fn(async () => undefined);
    const stop = jest.fn(async () => undefined);
    const services = mockAppServices({
      syncService: {
        start,
        stop,
      } as never,
    });

    renderWithServices(<Harness services={services} />, services);

    await waitFor(() => {
      expect(start).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(screen.getByLabelText("relock"));

    await waitFor(() => {
      expect(stop).toHaveBeenCalled();
    });
    const stopsAfterLock = stop.mock.calls.length;
    const startsAfterLock = start.mock.calls.length;

    fireEvent.press(screen.getByLabelText("reunlock"));

    await waitFor(() => {
      expect(start.mock.calls.length).toBe(startsAfterLock + 1);
    });
    expect(stop.mock.calls.length).toBeGreaterThanOrEqual(stopsAfterLock);
  });
});
