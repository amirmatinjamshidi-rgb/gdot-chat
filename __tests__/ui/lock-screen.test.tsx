import React from "react";
import { screen, userEvent, waitFor } from "@testing-library/react-native";

import LockScreen from "@/app/lock";
import { mockAppServices, randomId, renderWithServices } from "./helpers";

const mockUnlock = jest.fn();

jest.mock("@/lib/providers/app-lock-provider", () => ({
  useAppLock: () => ({
    unlock: (...args: unknown[]) => mockUnlock(...args),
    isUnlocked: false,
    dbReady: false,
    lockEpoch: 0,
    lock: jest.fn(),
  }),
}));

const expoRouter = jest.requireMock("expo-router") as {
  useRouter: () => { replace: jest.Mock };
};

describe("LockScreen PIN unlock", () => {
  beforeEach(() => {
    mockUnlock.mockReset();
  });

  it("unlocks with a valid app PIN and navigates to chats", async () => {
    const pin = `pin_${randomId("k")}`;
    mockUnlock.mockResolvedValue({ ok: true });
    const services = mockAppServices({
      kekManager: {
        hasKek: jest.fn(async () => true),
        getLockMode: jest.fn(async () => "pin" as const),
        getPassphraseForDb: jest.fn(async () => "pass"),
        createKekAfterBiometric: jest.fn(async () => undefined),
        createKekWithPin: jest.fn(async () => undefined),
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
        createKekAfterBiometric: jest.fn(async () => undefined),
        createKekWithPin: jest.fn(async () => undefined),
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
});
