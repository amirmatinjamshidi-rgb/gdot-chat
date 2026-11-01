import React from "react";
import { View } from "react-native";
import { fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";

import GroupRoomScreen from "@/app/GroupRoom";
import { useReactionsStore } from "@/stores/reactions-store";
import { mockAppServices, randomId, renderWithServices } from "./helpers";

const expoRouter = jest.requireMock("expo-router") as {
  useLocalSearchParams: jest.Mock;
};

function baseVoiceMocks(groupId: string) {
  const sendGroupOutgoing = jest.fn(async () => undefined);
  const sendGroupOutgoingMedia = jest.fn(async () => undefined);
  const sendReaction = jest.fn(async () => undefined);
  const userId = randomId("u");
  const msgId = randomId("msg");
  const envelopeId = randomId("env");
  return {
    sendGroupOutgoing,
    sendGroupOutgoingMedia,
    sendReaction,
    userId,
    msgId,
    envelopeId,
    services: mockAppServices({
      messageStore: {
        listByConversation: jest.fn(async () => [
          {
            id: msgId,
            clientId: randomId("c"),
            conversationId: groupId,
            direction: "incoming",
            kind: "text",
            plaintext: "hello-group",
            status: "delivered",
            senderDeviceId: "dev",
            senderUserId: randomId("peer"),
            serverEnvelopeId: envelopeId,
            createdAt: Date.now(),
          },
        ]),
      } as never,
      syncService: {
        sendGroupOutgoing,
        sendGroupOutgoingMedia,
        sendReaction,
        getGroupReceiptAggregate: jest.fn(async () => null),
        markGroupMessagesRead: jest.fn(async () => undefined),
        setReactionAppliedHandler: jest.fn(),
      } as never,
      identityStore: {
        getLocalIdentity: jest.fn(async () => ({
          userId,
          deviceId: randomId("d"),
        })),
      } as never,
      groupStore: {
        getGroup: jest.fn(async () => ({ id: groupId })),
        touchPreview: jest.fn(async () => undefined),
        listMembers: jest.fn(async () => []),
      } as never,
      reactionStore: {
        listForConversation: jest.fn(async () => new Map()),
        userHasReaction: jest.fn(async () => false),
        apply: jest.fn(async (_mid: string, emoji: string, uid: string) => [
          { emoji, users: [uid], count: 1 },
        ]),
      } as never,
    }),
  };
}

describe("GroupRoomScreen", () => {
  beforeEach(() => {
    useReactionsStore.setState({ byConversation: {} });
    jest.spyOn(View.prototype, "measureInWindow").mockImplementation(function (
      this: View,
      cb: (x: number, y: number, w: number, h: number) => void,
    ) {
      cb(12, 80, 160, 40);
    });
  });

  it("sends text via syncService.sendGroupOutgoing when composer has text", async () => {
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
        setReactionAppliedHandler: jest.fn(),
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
    await waitFor(() => {
      expect(screen.getByTestId("group-composer-send")).toBeTruthy();
    });
    await user.press(screen.getByTestId("group-composer-send"));

    await waitFor(() => {
      expect(sendGroupOutgoing).toHaveBeenCalledWith(groupId, text);
    });
    await waitFor(() => {
      expect(screen.getByText(text)).toBeTruthy();
    });
  });

  it("shows hold-to-record controls when composer is empty", async () => {
    const groupId = randomId("gid");
    expoRouter.useLocalSearchParams.mockReturnValue({
      id: groupId,
      name: "Voice",
    });
    const { services } = baseVoiceMocks(groupId);
    renderWithServices(<GroupRoomScreen />, services);
    await waitFor(() => {
      expect(screen.getByTestId("group-voice-controls")).toBeTruthy();
    });
    expect(
      screen.getByLabelText("Hold to record voice message"),
    ).toBeTruthy();
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
        setReactionAppliedHandler: jest.fn(),
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

  it("opens ReactionPicker on long-press and sends group reaction", async () => {
    const groupId = randomId("gid");
    expoRouter.useLocalSearchParams.mockReturnValue({
      id: groupId,
      name: "React",
    });
    const { services, sendReaction, msgId, envelopeId, userId } =
      baseVoiceMocks(groupId);

    renderWithServices(<GroupRoomScreen />, services);

    await waitFor(() => {
      expect(screen.getByText("hello-group")).toBeTruthy();
    });

    fireEvent(screen.getByText("hello-group"), "onLongPress");

    await waitFor(() => {
      expect(screen.getByText("👍")).toBeTruthy();
    });
    fireEvent.press(screen.getByText("👍"));

    await waitFor(() => {
      expect(sendReaction).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: groupId,
          targetServerEnvelopeId: envelopeId,
          emoji: "👍",
          op: "add",
          groupId,
        }),
      );
    });
    void userId;
    void msgId;
  });

  it("toggles an existing reaction chip via onReactionPress", async () => {
    const groupId = randomId("gid");
    expoRouter.useLocalSearchParams.mockReturnValue({
      id: groupId,
      name: "Toggle",
    });
    const { services, sendReaction, msgId, envelopeId, userId } =
      baseVoiceMocks(groupId);

    const map = new Map([
      [msgId, [{ emoji: "❤️", users: [userId], count: 1 }]],
    ]);
    const rs = services.reactionStore as unknown as {
      listForConversation: jest.Mock;
      userHasReaction: jest.Mock;
      apply: jest.Mock;
    };
    rs.listForConversation.mockResolvedValue(map);
    rs.userHasReaction.mockResolvedValue(true);
    rs.apply.mockResolvedValue([]);

    const user = userEvent.setup();
    renderWithServices(<GroupRoomScreen />, services);

    await waitFor(() => {
      expect(screen.getByText("❤️")).toBeTruthy();
    });
    await user.press(screen.getByText("❤️"));

    await waitFor(() => {
      expect(sendReaction).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: groupId,
          targetServerEnvelopeId: envelopeId,
          emoji: "❤️",
          op: "remove",
          groupId,
        }),
      );
    });
  });
});
