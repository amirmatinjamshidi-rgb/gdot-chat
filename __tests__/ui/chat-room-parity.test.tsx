import React from "react";
import { KeyboardAvoidingView } from "react-native";
import { screen, waitFor } from "@testing-library/react-native";

import ChatRoomScreen from "@/app/ChatRoom";
import GroupRoomScreen from "@/app/GroupRoom";
import { mockAppServices, randomId, renderWithServices } from "./helpers";

const expoRouter = jest.requireMock("expo-router") as {
  useLocalSearchParams: jest.Mock;
};

function servicesWithDraft(conversationId: string, draftText: string) {
  const draftStore = {
    get: jest.fn(async (id: string) =>
      id === conversationId ? draftText : "",
    ),
    set: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
  };
  return mockAppServices({
    draftStore: draftStore as never,
    messageStore: {
      listByConversation: jest.fn(async () => []),
    } as never,
    conversationStore: {
      getById: jest.fn(async () => ({
        id: conversationId,
        peerUserId: randomId("peer"),
        peerDeviceId: randomId("dev"),
        peerUsername: "peer",
      })),
    } as never,
    attachmentStore: { get: jest.fn(async () => null) } as never,
    syncService: {
      sendOutgoing: jest.fn(),
      sendOutgoingMedia: jest.fn(),
      sendGroupOutgoing: jest.fn(),
      sendGroupOutgoingMedia: jest.fn(),
      sendReaction: jest.fn(),
      getGroupReceiptAggregate: jest.fn(async () => null),
      markGroupMessagesRead: jest.fn(async () => undefined),
      setReactionAppliedHandler: jest.fn(),
      retryIdentityQuarantine: jest.fn(),
    } as never,
    signalService: {
      getIdentityTrust: jest.fn(async () => ({ keyChanged: false })),
      acceptNewIdentityKey: jest.fn(),
      getSafetyNumber: jest.fn(async () => "12345678901234567890"),
    } as never,
    identityStore: {
      getLocalIdentity: jest.fn(async () => ({
        userId: randomId("u"),
        deviceId: randomId("d"),
      })),
    } as never,
    groupStore: {
      getGroup: jest.fn(async () => ({ id: conversationId })),
      touchPreview: jest.fn(),
      listMembers: jest.fn(async () => []),
    } as never,
  });
}

describe("composer draft restore", () => {
  it("restores GroupRoom draft from draftStore on mount", async () => {
    const groupId = randomId("gid");
    const draftText = `draft_${randomId("t")}`;
    expoRouter.useLocalSearchParams.mockReturnValue({
      id: groupId,
      name: "Draft Group",
    });
    renderWithServices(
      <GroupRoomScreen />,
      servicesWithDraft(groupId, draftText),
    );
    await waitFor(() => {
      expect(screen.getByTestId("group-composer-input").props.value).toBe(
        draftText,
      );
    });
  });

  it("restores ChatRoom draft from draftStore on mount", async () => {
    const chatId = randomId("cid");
    const draftText = `chat_draft_${randomId("t")}`;
    expoRouter.useLocalSearchParams.mockReturnValue({
      id: chatId,
      name: "Peer",
    });
    renderWithServices(
      <ChatRoomScreen />,
      servicesWithDraft(chatId, draftText),
    );
    await waitFor(() => {
      expect(screen.getByTestId("chat-composer-input").props.value).toBe(
        draftText,
      );
    });
  });
});

describe("KeyboardAvoidingView chrome", () => {
  it("mounts KeyboardAvoidingView in GroupRoom", async () => {
    const groupId = randomId("gid");
    expoRouter.useLocalSearchParams.mockReturnValue({
      id: groupId,
      name: "KAV",
    });
    const { UNSAFE_getByType } = renderWithServices(
      <GroupRoomScreen />,
      servicesWithDraft(groupId, ""),
    );
    await waitFor(() => {
      expect(screen.getByTestId("group-keyboard-avoid")).toBeTruthy();
    });
    const kav = UNSAFE_getByType(KeyboardAvoidingView);
    expect(kav.props.behavior === "padding" || kav.props.behavior === "height").toBe(
      true,
    );
  });

  it("mounts KeyboardAvoidingView in ChatRoom", async () => {
    const chatId = randomId("cid");
    expoRouter.useLocalSearchParams.mockReturnValue({
      id: chatId,
      name: "KAV",
    });
    const { UNSAFE_getByType } = renderWithServices(
      <ChatRoomScreen />,
      servicesWithDraft(chatId, ""),
    );
    await waitFor(() => {
      expect(screen.getByTestId("chat-keyboard-avoid")).toBeTruthy();
    });
    const kav = UNSAFE_getByType(KeyboardAvoidingView);
    expect(kav.props.behavior === "padding" || kav.props.behavior === "height").toBe(
      true,
    );
  });
});

describe("swipe-back roots", () => {
  it("exposes GroupRoom swipe root", async () => {
    const groupId = randomId("gid");
    expoRouter.useLocalSearchParams.mockReturnValue({
      id: groupId,
      name: "Swipe",
    });
    renderWithServices(
      <GroupRoomScreen />,
      servicesWithDraft(groupId, ""),
    );
    await waitFor(() => {
      expect(screen.getByTestId("group-swipe-root")).toBeTruthy();
    });
  });

  it("exposes ChatRoom swipe root", async () => {
    const chatId = randomId("cid");
    expoRouter.useLocalSearchParams.mockReturnValue({
      id: chatId,
      name: "Swipe",
    });
    renderWithServices(
      <ChatRoomScreen />,
      servicesWithDraft(chatId, ""),
    );
    await waitFor(() => {
      expect(screen.getByTestId("chat-swipe-root")).toBeTruthy();
    });
  });
});
