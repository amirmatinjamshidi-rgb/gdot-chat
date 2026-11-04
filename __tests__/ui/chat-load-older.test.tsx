import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import ChatRoomScreen from "@/app/ChatRoom";
import GroupRoomScreen from "@/app/GroupRoom";
import { mockAppServices, randomId, renderWithServices } from "./helpers";

const expoRouter = jest.requireMock("expo-router") as {
  useLocalSearchParams: jest.Mock;
};

function msg(id: string, createdAt: number, text: string, conversationId: string) {
  return {
    id,
    clientId: `c_${id}`,
    conversationId,
    direction: "outgoing" as const,
    kind: "text" as const,
    plaintext: text,
    status: "sent" as const,
    senderDeviceId: "d1",
    createdAt,
  };
}

/** Oldest-first full page so hasMore stays true. */
function fullPage(conversationId: string, startAt: number, count: number) {
  // ascending createdAt
  return Array.from({ length: count }, (_, i) => {
    const createdAt = startAt + i;
    return msg(`m${createdAt}`, createdAt, `t${createdAt}`, conversationId);
  });
}

describe("load older on start reached", () => {
  it("ChatRoom calls listByConversation with before= cursor", async () => {
    const chatId = randomId("chat");
    const page1 = fullPage(chatId, 10_000, 50);
    const oldestInPage = page1[0]!.createdAt;
    const listByConversation = jest
      .fn()
      .mockImplementation(
        async (_id: string, _limit: number, before?: number) => {
          if (before == null) return page1;
          return [msg("m_old", before - 1, "older", chatId)];
        },
      );
    expoRouter.useLocalSearchParams.mockReturnValue({
      id: chatId,
      name: "Peer",
    });
    const services = mockAppServices({
      messageStore: { listByConversation } as never,
      conversationStore: {
        getById: jest.fn(async () => ({
          id: chatId,
          peerUserId: randomId("peer"),
          peerDeviceId: randomId("dev"),
          peerUsername: "peer",
        })),
      } as never,
    });

    renderWithServices(<ChatRoomScreen />, services);
    await waitFor(() => {
      expect(listByConversation).toHaveBeenCalled();
      expect(screen.getByTestId("chat-message-list")).toBeTruthy();
    });

    fireEvent(screen.getByTestId("chat-message-list"), "onStartReached");
    await waitFor(() => {
      const olderCall = listByConversation.mock.calls.find(
        (c: unknown[]) => typeof c[2] === "number",
      );
      expect(olderCall?.[2]).toBe(oldestInPage);
    });
  });

  it("GroupRoom load-older uses before= cursor too", async () => {
    const groupId = randomId("gid");
    const page1 = fullPage(groupId, 10_000, 50);
    const oldestInPage = page1[0]!.createdAt;
    const listByConversation = jest
      .fn()
      .mockImplementation(
        async (_id: string, _limit: number, before?: number) => {
          if (before == null) return page1;
          return [];
        },
      );
    expoRouter.useLocalSearchParams.mockReturnValue({
      id: groupId,
      name: "G",
    });
    const services = mockAppServices({
      messageStore: { listByConversation } as never,
      groupStore: {
        getGroup: jest.fn(async () => ({
          id: groupId,
          title: "G",
        })),
        touchPreview: jest.fn(),
        listMembers: jest.fn(async () => []),
      } as never,
    });

    renderWithServices(<GroupRoomScreen />, services);
    await waitFor(() => {
      expect(screen.getByTestId("group-message-list")).toBeTruthy();
    });
    fireEvent(screen.getByTestId("group-message-list"), "onStartReached");
    await waitFor(() => {
      const olderCall = listByConversation.mock.calls.find(
        (c: unknown[]) => typeof c[2] === "number",
      );
      expect(olderCall?.[2]).toBe(oldestInPage);
    });
  });
});
