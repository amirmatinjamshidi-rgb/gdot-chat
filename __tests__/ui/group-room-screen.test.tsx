import React from "react";
import { screen, userEvent, waitFor } from "@testing-library/react-native";

import GroupRoomScreen from "@/app/GroupRoom";
import { mockAppServices, randomId, renderWithServices } from "./helpers";

const expoRouter = jest.requireMock("expo-router") as {
  useLocalSearchParams: jest.Mock;
};

describe("GroupRoomScreen", () => {
  it("sends via syncService.sendGroupOutgoing and shows the message", async () => {
    const groupId = randomId("gid");
    const text = `hello_${randomId("m")}`;
    expoRouter.useLocalSearchParams.mockReturnValue({
      id: groupId,
      name: "Test Group",
    });

    const sendGroupOutgoing = jest.fn(async () => undefined);
    const listByConversation = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: randomId("msg"),
          clientId: randomId("c"),
          conversationId: groupId,
          direction: "outgoing",
          kind: "text",
          plaintext: text,
          status: "sent",
          senderDeviceId: "dev",
          createdAt: Date.now(),
        },
      ]);

    const services = mockAppServices({
      messageStore: { listByConversation } as never,
      syncService: { sendGroupOutgoing } as never,
      identityStore: {
        getLocalIdentity: jest.fn(async () => ({
          userId: randomId("u"),
          deviceId: randomId("d"),
        })),
      } as never,
      groupStore: {
        getGroup: jest.fn(async () => ({ id: groupId })),
        touchPreview: jest.fn(async () => undefined),
      } as never,
    });

    const user = userEvent.setup();
    renderWithServices(<GroupRoomScreen />, services);

    await waitFor(() => {
      expect(screen.getByTestId("group-composer-input")).toBeTruthy();
    });

    await user.type(screen.getByTestId("group-composer-input"), text);
    await user.press(screen.getByTestId("group-composer-send"));

    await waitFor(() => {
      expect(sendGroupOutgoing).toHaveBeenCalledWith(groupId, text);
    });
    await waitFor(() => {
      expect(screen.getByText(text)).toBeTruthy();
    });
  });
});
