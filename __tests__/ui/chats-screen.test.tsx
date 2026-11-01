import React from "react";
import { screen, userEvent, waitFor } from "@testing-library/react-native";

import ChatsScreen from "@/app/(tabs)/chats";
import { mockAppServices, randomId, renderWithServices } from "./helpers";

const expoRouter = jest.requireMock("expo-router") as {
  useRouter: () => { push: jest.Mock };
};

describe("ChatsScreen", () => {
  it("lists conversations from the store and opens a chat on press", async () => {
    const peer = `peer_${randomId("u")}`;
    const chatId = randomId("chat");
    const preview = `preview-${randomId("p")}`;
    const services = mockAppServices({
      conversationStore: {
        listAll: jest.fn(async () => [
          {
            id: chatId,
            peerUserId: randomId("uid"),
            peerUsername: peer,
            peerDeviceId: randomId("dev"),
            lastMessagePreview: preview,
            lastMessageAt: Date.now(),
            unreadCount: 2,
          },
        ]),
      } as never,
    });

    const user = userEvent.setup();
    renderWithServices(<ChatsScreen />, services);

    await waitFor(() => {
      expect(screen.getByText(peer)).toBeTruthy();
    });
    expect(screen.getByText(preview)).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();

    await user.press(screen.getByText(peer));
    expect(expoRouter.useRouter().push).toHaveBeenCalledWith({
      pathname: "/ChatRoom",
      params: { id: chatId, name: peer },
    });
  });

  it("filters the list by search query", async () => {
    const keep = `keep_${randomId("a")}`;
    const drop = `drop_${randomId("b")}`;
    const services = mockAppServices({
      conversationStore: {
        listAll: jest.fn(async () => [
          {
            id: randomId("c1"),
            peerUserId: randomId("u1"),
            peerUsername: keep,
            peerDeviceId: randomId("d1"),
            lastMessagePreview: "alpha",
            lastMessageAt: Date.now(),
            unreadCount: 0,
          },
          {
            id: randomId("c2"),
            peerUserId: randomId("u2"),
            peerUsername: drop,
            peerDeviceId: randomId("d2"),
            lastMessagePreview: "beta",
            lastMessageAt: Date.now(),
            unreadCount: 0,
          },
        ]),
      } as never,
    });

    const user = userEvent.setup();
    renderWithServices(<ChatsScreen />, services);
    await waitFor(() => expect(screen.getByText(keep)).toBeTruthy());

    const search = screen.getByPlaceholderText(/search/i);
    await user.type(search, keep.slice(0, 8));

    await waitFor(() => {
      expect(screen.getByText(keep)).toBeTruthy();
      expect(screen.queryByText(drop)).toBeNull();
    });
  });
});
