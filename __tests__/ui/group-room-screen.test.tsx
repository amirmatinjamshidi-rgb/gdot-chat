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
      syncService: {
        sendGroupOutgoing,
        sendGroupOutgoingMedia: jest.fn(async () => undefined),
        sendReaction: jest.fn(async () => undefined),
        getGroupReceiptAggregate: jest.fn(async () => null),
        markGroupMessagesRead: jest.fn(async () => undefined),
      } as never,
      identityStore: {
        getLocalIdentity: jest.fn(async () => ({
          userId: randomId("u"),
          deviceId: randomId("d"),
        })),
      } as never,
      groupStore: {
        getGroup: jest.fn(async () => ({ id: groupId })),
        touchPreview: jest.fn(async () => undefined),
        listMembers: jest.fn(async () => []),
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

  it("shows aggregated group receipt label and info list", async () => {
    const groupId = randomId("gid");
    const msgId = randomId("msg");
    const clientId = randomId("c");
    const bob = randomId("bob");
    expoRouter.useLocalSearchParams.mockReturnValue({
      id: groupId,
      name: "Receipts",
    });

    const getGroupReceiptAggregate = jest.fn(async () => ({
      deliveredUserIds: [bob],
      readUserIds: [bob],
      deliveredDeviceCount: 1,
      readDeviceCount: 1,
    }));

    const services = mockAppServices({
      messageStore: {
        listByConversation: jest.fn(async () => [
          {
            id: msgId,
            clientId,
            conversationId: groupId,
            direction: "outgoing",
            kind: "text",
            plaintext: "hi",
            status: "delivered",
            senderDeviceId: "dev",
            createdAt: Date.now(),
          },
        ]),
      } as never,
      syncService: {
        sendGroupOutgoing: jest.fn(),
        sendGroupOutgoingMedia: jest.fn(),
        sendReaction: jest.fn(),
        getGroupReceiptAggregate,
        markGroupMessagesRead: jest.fn(async () => undefined),
      } as never,
      identityStore: {
        getLocalIdentity: jest.fn(async () => ({
          userId: randomId("u"),
          deviceId: randomId("d"),
        })),
      } as never,
      groupStore: {
        getGroup: jest.fn(async () => ({ id: groupId })),
        touchPreview: jest.fn(async () => undefined),
        listMembers: jest.fn(async () => [
          { userId: bob, username: "bob", role: "member", leftAt: null },
        ]),
      } as never,
    });

    const user = userEvent.setup();
    renderWithServices(<GroupRoomScreen />, services);

    await waitFor(() => {
      expect(screen.getByTestId(`group-receipt-${msgId}`)).toBeTruthy();
    });
    expect(screen.getByText(/Delivered to all/)).toBeTruthy();

    await user.press(screen.getByTestId(`group-receipt-${msgId}`));
    await waitFor(() => {
      expect(screen.getByTestId(`group-receipt-info-${msgId}`)).toBeTruthy();
    });
    expect(screen.getByText(/Read: bob/)).toBeTruthy();
  });

  it("attach media calls sendGroupOutgoingMedia", async () => {
    const groupId = randomId("gid");
    expoRouter.useLocalSearchParams.mockReturnValue({
      id: groupId,
      name: "Media",
    });
    const sendGroupOutgoingMedia = jest.fn(async () => undefined);
    const services = mockAppServices({
      messageStore: {
        listByConversation: jest.fn(async () => []),
      } as never,
      syncService: {
        sendGroupOutgoing: jest.fn(),
        sendGroupOutgoingMedia,
        sendReaction: jest.fn(),
        getGroupReceiptAggregate: jest.fn(async () => null),
        markGroupMessagesRead: jest.fn(async () => undefined),
      } as never,
      identityStore: {
        getLocalIdentity: jest.fn(async () => ({
          userId: randomId("u"),
          deviceId: randomId("d"),
        })),
      } as never,
      groupStore: {
        getGroup: jest.fn(async () => ({ id: groupId })),
        touchPreview: jest.fn(async () => undefined),
        listMembers: jest.fn(async () => []),
      } as never,
    });
    const user = userEvent.setup();
    renderWithServices(<GroupRoomScreen />, services);
    await waitFor(() => {
      expect(screen.getByTestId("group-attach-media")).toBeTruthy();
    });
    await user.press(screen.getByTestId("group-attach-media"));
    await waitFor(() => {
      expect(sendGroupOutgoingMedia).toHaveBeenCalledWith(
        groupId,
        expect.objectContaining({ kind: "voice" }),
      );
    });
  });
});
