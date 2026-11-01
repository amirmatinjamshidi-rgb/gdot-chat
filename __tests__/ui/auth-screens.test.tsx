import React from "react";
import { screen, userEvent, waitFor } from "@testing-library/react-native";

import LoginScreen from "@/app/(auth)/login";
import RegisterScreen from "@/app/(auth)/register";
import SetAppPinScreen from "@/app/(auth)/set-app-pin";
import {
  setPendingAppPinAuth,
  takePendingAppPinAuth,
} from "@/lib/auth/pending-app-pin-auth";
import { AppAuthError } from "@/lib/auth/app-auth-error";
import { mockAppServices, randomId, renderWithServices } from "./helpers";

jest.mock("@/lib/providers/auth-provider", () => ({
  useAuth: () => ({
    refresh: jest.fn(async () => undefined),
    isLoggedIn: false,
    isLoading: false,
    signOut: jest.fn(async () => undefined),
  }),
}));

const mockLoginUser = jest.fn();
const mockRegisterUser = jest.fn();

jest.mock("@/lib/auth/registration", () => ({
  loginUser: (...args: unknown[]) => mockLoginUser(...args),
  registerUser: (...args: unknown[]) => mockRegisterUser(...args),
}));

const expoRouter = jest.requireMock("expo-router") as {
  useRouter: () => { replace: jest.Mock; push: jest.Mock };
};

describe("Login / Register / SetAppPin screens", () => {
  beforeEach(() => {
    mockLoginUser.mockReset();
    mockRegisterUser.mockReset();
    takePendingAppPinAuth();
  });

  it("logs in with username/password and routes to lock", async () => {
    const username = `user_${randomId("u")}`;
    const password = `pw_${randomId("p")}!Aa1`;
    mockLoginUser.mockResolvedValue(undefined);
    const services = mockAppServices();
    const user = userEvent.setup();

    renderWithServices(<LoginScreen />, services);
    await user.type(screen.getByPlaceholderText("Username"), username);
    await user.type(screen.getByPlaceholderText("Password"), password);
    await user.press(screen.getByText("Sign in"));

    await waitFor(() => {
      expect(mockLoginUser).toHaveBeenCalledWith(
        expect.objectContaining({ username, password }),
      );
      expect(expoRouter.useRouter().replace).toHaveBeenCalledWith("/lock");
    });
  });

  it("routes login to set-app-pin when PIN_REQUIRED", async () => {
    const username = `user_${randomId("u")}`;
    const password = `pw_${randomId("p")}!Aa1`;
    mockLoginUser.mockRejectedValue(
      new AppAuthError("PIN_REQUIRED", "need pin"),
    );
    const user = userEvent.setup();
    renderWithServices(<LoginScreen />, mockAppServices());

    await user.type(screen.getByPlaceholderText("Username"), username);
    await user.type(screen.getByPlaceholderText("Password"), password);
    await user.press(screen.getByText("Sign in"));

    await waitFor(() => {
      expect(expoRouter.useRouter().push).toHaveBeenCalledWith(
        "/(auth)/set-app-pin",
      );
    });
  });

  it("registers a new account", async () => {
    const username = `user_${randomId("u")}`;
    const password = `pw_${randomId("p")}!Aa12`;
    mockRegisterUser.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithServices(<RegisterScreen />, mockAppServices());

    await user.type(screen.getByPlaceholderText("Username"), username);
    await user.type(screen.getByPlaceholderText("Password (min 8)"), password);
    await user.press(screen.getByText("Register"));

    await waitFor(() => {
      expect(mockRegisterUser).toHaveBeenCalledWith(
        expect.objectContaining({ username, password, deviceName: "Mobile" }),
      );
      expect(expoRouter.useRouter().replace).toHaveBeenCalledWith("/lock");
    });
  });



  it("routes register to set-app-pin when NOT_ENROLLED", async () => {
    const username = `user_${randomId("u")}`;
    const password = `pw_${randomId("p")}!Aa12`;
    mockRegisterUser.mockRejectedValue(
      new AppAuthError("NOT_ENROLLED", "no biometrics"),
    );
    const user = userEvent.setup();
    renderWithServices(<RegisterScreen />, mockAppServices());

    await user.type(screen.getByPlaceholderText("Username"), username);
    await user.type(screen.getByPlaceholderText("Password (min 8)"), password);
    await user.press(screen.getByText("Register"));

    await waitFor(() => {
      expect(expoRouter.useRouter().push).toHaveBeenCalledWith(
        "/(auth)/set-app-pin",
      );
    });
  });

  it("routes register to set-app-pin when PIN_REQUIRED", async () => {
    const username = `user_${randomId("u")}`;
    const password = `pw_${randomId("p")}!Aa12`;
    mockRegisterUser.mockRejectedValue(
      new AppAuthError("PIN_REQUIRED", "need pin"),
    );
    const user = userEvent.setup();
    renderWithServices(<RegisterScreen />, mockAppServices());

    await user.type(screen.getByPlaceholderText("Username"), username);
    await user.type(screen.getByPlaceholderText("Password (min 8)"), password);
    await user.press(screen.getByText("Register"));

    await waitFor(() => {
      expect(expoRouter.useRouter().push).toHaveBeenCalledWith(
        "/(auth)/set-app-pin",
      );
    });
  });

  it("completes registration after setting an app PIN", async () => {
    const username = `user_${randomId("u")}`;
    const password = `pw_${randomId("p")}!Aa12`;
    const pin = `pin_${randomId("x")}`;
    setPendingAppPinAuth({
      kind: "register",
      username,
      password,
      deviceName: "Mobile",
    });
    mockRegisterUser.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithServices(<SetAppPinScreen />, mockAppServices());

    await user.type(screen.getByPlaceholderText(/App PIN \(min/i), pin);
    await user.type(screen.getByPlaceholderText(/Confirm app PIN/i), pin);
    await user.press(screen.getByText("Continue"));

    await waitFor(() => {
      expect(mockRegisterUser).toHaveBeenCalledWith(
        expect.objectContaining({ username, password, appPin: pin }),
      );
      expect(expoRouter.useRouter().replace).toHaveBeenCalledWith("/lock");
    });
  });

  it("shows Securing your PIN progress state while registration runs", async () => {
    const username = `user_${randomId("u")}`;
    const password = `pw_${randomId("p")}!Aa12`;
    const pin = `pin_${randomId("x")}`;
    setPendingAppPinAuth({
      kind: "register",
      username,
      password,
      deviceName: "Mobile",
    });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockRegisterUser.mockImplementation(async () => {
      await gate;
    });

    const user = userEvent.setup();
    renderWithServices(<SetAppPinScreen />, mockAppServices());

    await user.type(screen.getByPlaceholderText(/App PIN \(min/i), pin);
    await user.type(screen.getByPlaceholderText(/Confirm app PIN/i), pin);
    await user.press(screen.getByText("Continue"));

    await waitFor(() => {
      expect(screen.getByLabelText(/Securing your PIN/i)).toBeTruthy();
      expect(screen.getByText(/Securing your PIN/i)).toBeTruthy();
    });

    release();

    await waitFor(() => {
      expect(mockRegisterUser).toHaveBeenCalled();
      expect(expoRouter.useRouter().replace).toHaveBeenCalledWith("/lock");
    });
  });
});
