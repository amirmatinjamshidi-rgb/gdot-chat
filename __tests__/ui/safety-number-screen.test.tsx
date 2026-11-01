import React from "react";
import { screen, userEvent, waitFor } from "@testing-library/react-native";

import SafetyNumberScreen from "@/app/safety-number";
import { mockAppServices, randomId, renderWithServices } from "./helpers";

const expoRouter = jest.requireMock("expo-router") as {
  useLocalSearchParams: jest.Mock;
  useRouter: () => { back: jest.Mock };
};

describe("SafetyNumberScreen", () => {
  it("renders formatted safety number and accepts a changed key", async () => {
    const peerUserId = randomId("peer");
    const peerDeviceId = randomId("dev");
    const digits = "ABCDEF1234567890ZZZZ";
    expoRouter.useLocalSearchParams.mockReturnValue({ peerUserId, peerDeviceId });

    const acceptNewIdentityKey = jest.fn(async () => undefined);
    const retryIdentityQuarantine = jest.fn(async () => undefined);
    const services = mockAppServices({
      signalService: {
        getSafetyNumber: jest.fn(async () => digits),
        getIdentityTrust: jest.fn(async () => ({ keyChanged: true })),
        acceptNewIdentityKey,
      } as never,
      syncService: {
        listMessageRequests: jest.fn(async () => []),
        acceptMessageRequest: jest.fn(async () => undefined),
        rejectMessageRequest: jest.fn(async () => undefined),
        retryIdentityQuarantine,
        stop: jest.fn(async () => undefined),
      } as never,
    });

    const user = userEvent.setup();
    renderWithServices(<SafetyNumberScreen />, services);

    await waitFor(() => {
      expect(screen.getByText(/identity key changed/i)).toBeTruthy();
      expect(screen.getByText("ABCDE F1234 56789 0ZZZZ")).toBeTruthy();
    });

    await user.press(screen.getByText("Accept and mark verified"));
    await waitFor(() => {
      expect(acceptNewIdentityKey).toHaveBeenCalledWith(peerUserId, {
        markVerified: true,
      });
      expect(retryIdentityQuarantine).toHaveBeenCalledWith(peerUserId);
      expect(expoRouter.useRouter().back).toHaveBeenCalled();
    });
  });
});
