import React from "react";
import { render, screen } from "@testing-library/react-native";

import { TextMessageBubble } from "@/components/reactions/text-message-bubble";
import { randomId } from "./helpers";

function renderBubble(status: string | undefined, isMine = true) {
  const messageId = randomId("msg");
  const text = `hello-${randomId("txt")}`;
  render(
    <TextMessageBubble
      messageId={messageId}
      text={text}
      time="12:00"
      isMine={isMine}
      primaryColor="#fff"
      timeColor="#ccc"
      deliveryStatus={status}
      bubbleStyle={[{}]}
      reactions={[]}
      myId={randomId("user")}
      onLongPress={jest.fn()}
      onReactionPress={jest.fn()}
    />,
  );
  return text;
}

describe("TextMessageBubble delivery ticks", () => {
  it("shows single tick while sending/pending/sent", () => {
    for (const status of ["sending", "pending", "sent"] as const) {
      const text = renderBubble(status);
      expect(screen.getByText(text)).toBeTruthy();
      expect(screen.getByText(/12:00 ✓$/)).toBeTruthy();
      screen.unmount();
    }
  });

  it("shows double tick when delivered", () => {
    const text = renderBubble("delivered");
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByText(/12:00 ✓✓$/)).toBeTruthy();
  });

  it("shows failure mark when failed", () => {
    const text = renderBubble("failed");
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByText(/12:00 !$/)).toBeTruthy();
  });

  it("hides ticks for inbound messages", () => {
    const text = renderBubble("delivered", false);
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByText("12:00")).toBeTruthy();
    expect(screen.queryByText(/✓/)).toBeNull();
  });
});
