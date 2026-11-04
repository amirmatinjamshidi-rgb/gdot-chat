import React from "react";
import { fireEvent, screen } from "@testing-library/react-native";

import { ChatMessageRow } from "@/components/chat/chat-message-row";
import { randomId, renderWithServices } from "./helpers";

describe("ChatMessageRow", () => {
  it("invokes onDownloadMedia when transfer card is pressed", () => {
    const msgId = randomId("msg");
    const attId = randomId("att");
    const onDownloadMedia = jest.fn();
    renderWithServices(
      <ChatMessageRow
        item={{
          id: msgId,
          chatId: randomId("c"),
          sender: "peer",
          time: "12:00",
          kind: "voice",
          attachmentId: attId,
          transferState: "pending",
          durationMs: 1200,
        }}
        currentUserId={randomId("u")}
        isActive={false}
        onLongPress={jest.fn()}
        onReactionPress={jest.fn()}
        onActivatePlayback={jest.fn()}
        onDeactivatePlayback={jest.fn()}
        onDownloadMedia={onDownloadMedia}
      />,
    );
    fireEvent.press(screen.getByTestId(`media-transfer-${msgId}`));
    expect(onDownloadMedia).toHaveBeenCalledWith(attId);
  });

  it("renders text bubble content", () => {
    const text = `hello_${randomId("t")}`;
    renderWithServices(
      <ChatMessageRow
        item={{
          id: randomId("msg"),
          chatId: randomId("c"),
          sender: "me",
          time: "12:01",
          kind: "text",
          text,
          isMine: true,
        }}
        currentUserId={randomId("u")}
        isActive={false}
        onLongPress={jest.fn()}
        onReactionPress={jest.fn()}
        onActivatePlayback={jest.fn()}
        onDeactivatePlayback={jest.fn()}
        onDownloadMedia={jest.fn()}
      />,
    );
    expect(screen.getByText(text)).toBeTruthy();
  });
});
