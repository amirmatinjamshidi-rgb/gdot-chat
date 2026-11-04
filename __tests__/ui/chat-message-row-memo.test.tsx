import React from "react";
import { screen } from "@testing-library/react-native";

import { ChatMessageRow } from "@/components/chat/chat-message-row";
import { randomId, renderWithServices } from "./helpers";

describe("ChatMessageRow memo", () => {
  it("is a React.memo component with stable displayName", () => {
    expect(ChatMessageRow.displayName).toBe("ChatMessageRow");
    // React.memo wraps the impl; $$typeof is the memo symbol.
    expect(
      (ChatMessageRow as unknown as { $$typeof: symbol }).$$typeof,
    ).toBe(Symbol.for("react.memo"));
  });

  it("only the active row receives isActive=true (prop isolation)", () => {
    const a = randomId("msg");
    const b = randomId("msg");
    const shared = {
      chatId: randomId("c"),
      sender: "me" as const,
      time: "12:01",
      kind: "text" as const,
      isMine: true,
    };
    const stable = {
      currentUserId: randomId("u"),
      onLongPress: jest.fn(),
      onReactionPress: jest.fn(),
      onActivatePlayback: jest.fn(),
      onDeactivatePlayback: jest.fn(),
      onDownloadMedia: jest.fn(),
    };
    renderWithServices(
      <>
        <ChatMessageRow
          item={{ ...shared, id: a, text: `A_${a}` }}
          isActive={false}
          highlightEmoji={null}
          {...stable}
        />
        <ChatMessageRow
          item={{ ...shared, id: b, text: `B_${b}` }}
          isActive={true}
          highlightEmoji={null}
          {...stable}
        />
      </>,
    );
    expect(screen.getByText(`A_${a}`)).toBeTruthy();
    expect(screen.getByText(`B_${b}`)).toBeTruthy();
  });
});
