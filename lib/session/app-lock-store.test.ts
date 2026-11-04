import { describe, expect, it } from "vitest";

import {
  AppLockStore,
  shouldLockOnAppStateChange,
} from "@/lib/session/app-lock-store";

describe("AppLockStore immediate background lock", () => {
  it("onBackground locks immediately", () => {
    const store = new AppLockStore();
    store.unlock();
    let locked = 0;
    store.onLock(() => {
      locked += 1;
    });
    store.onBackground(60_000);
    expect(store.isUnlocked).toBe(false);
    expect(locked).toBe(1);
  });

  it("suppresses background lock while suppress count > 0", () => {
    const store = new AppLockStore();
    store.unlock();
    let locked = 0;
    store.onLock(() => {
      locked += 1;
    });
    store.beginSuppressBackgroundLock();
    store.onBackground();
    expect(store.isUnlocked).toBe(true);
    expect(locked).toBe(0);
    store.endSuppressBackgroundLock();
    store.onBackground();
    expect(store.isUnlocked).toBe(false);
    expect(locked).toBe(1);
  });

  it("onForeground does not unlock", () => {
    const store = new AppLockStore();
    store.lock();
    store.onForeground();
    expect(store.isUnlocked).toBe(false);
  });
});

describe("shouldLockOnAppStateChange", () => {
  it("locks only on background when not suppressed / not unlocking", () => {
    expect(
      shouldLockOnAppStateChange("background", {
        unlockInProgress: false,
        suppressingBackgroundLock: false,
      }),
    ).toBe(true);
  });

  it("ignores inactive", () => {
    expect(
      shouldLockOnAppStateChange("inactive", {
        unlockInProgress: false,
        suppressingBackgroundLock: false,
      }),
    ).toBe(false);
  });

  it("ignores background while unlock in progress", () => {
    expect(
      shouldLockOnAppStateChange("background", {
        unlockInProgress: true,
        suppressingBackgroundLock: false,
      }),
    ).toBe(false);
  });

  it("ignores background while suppressing (OS dialogs)", () => {
    expect(
      shouldLockOnAppStateChange("background", {
        unlockInProgress: false,
        suppressingBackgroundLock: true,
      }),
    ).toBe(false);
  });
});
