import React from "react";
import { screen, userEvent, waitFor } from "@testing-library/react-native";

import LockScreen from "@/app/lock";
import { mockAppServices, randomId, renderWithServices } from "./helpers";

const mockUnlock = jest.fn();
let mockLockEpoch = 0;

jest.mock("@/lib/providers/app-lock-provider", () => ({
  useAppLock: () => ({
    unlock: (...args: unknown[]) => mockUnlock(...args),
    isUnlocked: false,
    dbReady: false,
    lockEpoch: mockLockEpoch,
    lock: jest.fn(),
    beginSuppressBackgroundLock: jest.fn(),
    endSuppressBackgroundLock: jest.fn(),
  }),
}));

const expoRouter = jest.requireMock("expo-router") as {
  useRouter: () => { replace: jest.Mock };
};

describe("LockScreen PIN unlock", () => {
  beforeEach(() => {
    mockUnlock.mockReset();
    mockLockEpoch = 0;
  });

  it("unlocks with a valid app PIN and navigates to chats", async () => {
    const pin = `pin_${randomId("k")}`;
    mockUnlock.mockResolvedValue({ ok: true });
    const services = mockAppServices({
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
    const user = userEvent.setup();
    renderWithServices(<LockScreen />, services);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/App PIN/i)).toBeTruthy();
    });

    await user.type(screen.getByPlaceholderText(/App PIN/i), pin);
    await user.press(screen.getByText("Unlock"));

    await waitFor(() => {
      expect(mockUnlock).toHaveBeenCalledWith(pin);
      expect(expoRouter.useRouter().replace).toHaveBeenCalledWith(
        "/(tabs)/chats",
      );
    });
  });

  it("shows Securing your PIN while PIN unlock is in flight", async () => {
    const pin = `pin_${randomId("k")}`;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockUnlock.mockImplementation(async () => {
      await gate;
      return { ok: true };
    });
    const services = mockAppServices({
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
    const user = userEvent.setup();
    renderWithServices(<LockScreen />, services);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/App PIN/i)).toBeTruthy();
    });

    await user.type(screen.getByPlaceholderText(/App PIN/i), pin);
    await user.press(screen.getByText("Unlock"));

    await waitFor(() => {
      expect(screen.getByLabelText(/Securing your PIN/i)).toBeTruthy();
    });

    release();

    await waitFor(() => {
      expect(mockUnlock).toHaveBeenCalledWith(pin);
      expect(expoRouter.useRouter().replace).toHaveBeenCalledWith(
        "/(tabs)/chats",
      );
    });
  });

  it("warm session (cached passphrase) auto-unlocks once without PIN entry", async () => {
    mockUnlock.mockResolvedValue({ ok: true });
    const services = mockAppServices({
      kekManager: {
        hasKek: jest.fn(async () => true),
        getLockMode: jest.fn(async () => "pin" as const),
        getPassphraseForDb: jest.fn(async () => "pass"),
        clearCachedPassphrase: jest.fn(),
        hasCachedPassphrase: jest.fn(() => true),
        createKekAfterBiometric: jest.fn(async () => undefined),
        createKekWithPin: jest.fn(async () => undefined),
        wipeKek: jest.fn(async () => undefined),
      } as never,
    });

    renderWithServices(<LockScreen />, services);
    await waitFor(() => {
      expect(mockUnlock).toHaveBeenCalledTimes(1);
      expect(mockUnlock).toHaveBeenCalledWith(undefined);
      expect(expoRouter.useRouter().replace).toHaveBeenCalledWith(
        "/(tabs)/chats",
      );
    });
  });
});

describe("LockScreen biometric auto-unlock", () => {
  beforeEach(() => {
    mockUnlock.mockReset();
    mockLockEpoch = 42;
    mockUnlock.mockResolvedValue({ ok: true });
  });

  it("auto-unlock calls unlock only once under double mount (same lockEpoch)", async () => {
    const services = mockAppServices({
      kekManager: {
        hasKek: jest.fn(async () => true),
        getLockMode: jest.fn(async () => "biometric" as const),
        getPassphraseForDb: jest.fn(async () => "pass"),
        clearCachedPassphrase: jest.fn(),
        hasCachedPassphrase: jest.fn(() => false),
        createKekAfterBiometric: jest.fn(async () => undefined),
        createKekWithPin: jest.fn(async () => undefined),
        wipeKek: jest.fn(async () => undefined),
      } as never,
    });

    const first = renderWithServices(<LockScreen />, services);
    await waitFor(() => {
      expect(mockUnlock).toHaveBeenCalledTimes(1);
    });

    first.unmount();

    // Strict Mode-style remount with the same lockEpoch must not unlock again.
    renderWithServices(<LockScreen />, services);
    await waitFor(() => {
      expect(screen.getByText("Locked")).toBeTruthy();
    });
    // Give effects a turn; count must stay 1.
    await waitFor(() => {
      expect(mockUnlock).toHaveBeenCalledTimes(1);
    });
  });
});

describe("LockScreen biometric-first (no PIN / no scrypt UI)", () => {
  beforeEach(() => {
    mockUnlock.mockReset();
    mockLockEpoch = 7;
    mockUnlock.mockResolvedValue({ ok: true });
  });

  it("shows biometric unlock CTA and never renders PIN field", async () => {
    const services = mockAppServices({
      kekManager: {
        hasKek: jest.fn(async () => true),
        getLockMode: jest.fn(async () => "biometric" as const),
        getPassphraseForDb: jest.fn(async () => "pass"),
        clearCachedPassphrase: jest.fn(),
        hasCachedPassphrase: jest.fn(() => false),
        createKekAfterBiometric: jest.fn(async () => undefined),
        createKekWithPin: jest.fn(async () => undefined),
        wipeKek: jest.fn(async () => undefined),
      } as never,
    });

    renderWithServices(<LockScreen />, services);
    await waitFor(() => {
      expect(screen.getByTestId("biometric-unlock-button")).toBeTruthy();
      expect(screen.getByText(/Unlock with biometrics/i)).toBeTruthy();
    });
    expect(screen.queryByPlaceholderText(/App PIN/i)).toBeNull();
    // Auto-unlock path uses SecureStore biometric — unlock(undefined), never a PIN.
    await waitFor(() => {
      expect(mockUnlock).toHaveBeenCalledWith(undefined);
    });
  });
});
