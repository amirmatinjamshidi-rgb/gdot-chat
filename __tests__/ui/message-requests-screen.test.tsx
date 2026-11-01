import React from "react";
import { screen, userEvent, waitFor } from "@testing-library/react-native";

import MessageRequestsScreen from "@/app/message-requests";
import { mockAppServices, randomId, renderWithServices } from "./helpers";

describe("MessageRequestsScreen", () => {
  it("accepts and rejects pending requests via syncService", async () => {
    const acceptId = randomId("req");
    const rejectId = randomId("req");
    const acceptName = `sender_${randomId("a")}`;
    const rejectName = `sender_${randomId("b")}`;

    let pending = [
      {
        id: acceptId,
        serverEnvelopeId: randomId("env"),
        senderDeviceId: randomId("dev"),
        senderUsername: acceptName,
        kind: "message_request" as const,
        messageType: 3,
        ciphertext: new Uint8Array([1]),
        errorClass: "message_request",
        errorName: "UnknownSender",
        createdAt: Date.now(),
        status: "pending" as const,
        updatedAt: Date.now(),
      },
      {
        id: rejectId,
        serverEnvelopeId: randomId("env"),
        senderDeviceId: randomId("dev"),
        senderUsername: rejectName,
        kind: "message_request" as const,
        messageType: 3,
        ciphertext: new Uint8Array([2]),
        errorClass: "message_request",
        errorName: "UnknownSender",
        createdAt: Date.now(),
        status: "pending" as const,
        updatedAt: Date.now(),
      },
    ];

    const acceptMessageRequest = jest.fn(async (id: string) => {
      pending = pending.filter((x) => x.id !== id);
    });
    const rejectMessageRequest = jest.fn(async (id: string) => {
      pending = pending.filter((x) => x.id !== id);
    });
    const listMessageRequests = jest.fn(async () => [...pending]);

    const services = mockAppServices({
      syncService: {
        listMessageRequests,
        acceptMessageRequest,
        rejectMessageRequest,
        retryIdentityQuarantine: jest.fn(async () => undefined),
        stop: jest.fn(async () => undefined),
      } as never,
    });

    const user = userEvent.setup();
    renderWithServices(<MessageRequestsScreen />, services);

    await waitFor(() => {
      expect(screen.getByText(acceptName)).toBeTruthy();
      expect(screen.getByText(rejectName)).toBeTruthy();
    });

    await user.press(screen.getAllByText("Accept")[0]);
    await waitFor(() =>
      expect(acceptMessageRequest).toHaveBeenCalledWith(acceptId),
    );

    await waitFor(() => {
      expect(screen.queryByText(acceptName)).toBeNull();
      expect(screen.getByText(rejectName)).toBeTruthy();
    });

    await user.press(screen.getByText("Reject"));
    await waitFor(() =>
      expect(rejectMessageRequest).toHaveBeenCalledWith(rejectId),
    );
  });
});
