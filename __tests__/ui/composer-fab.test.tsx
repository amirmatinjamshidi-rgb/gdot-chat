import React, { useState } from "react";
import { TextInput, View } from "react-native";
import {
  fireEvent,
  render,
  screen,
  userEvent,
} from "@testing-library/react-native";

import { ComposerFab } from "@/components/composer-fab";
import { randomId } from "./helpers";

function MiniComposer({ onSend }: { onSend: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();
  return (
    <View>
      <TextInput
        placeholder="Type a message..."
        value={draft}
        onChangeText={setDraft}
      />
      <ComposerFab
        isSendOnly={trimmed.length > 0}
        composerMode="send"
        onSendText={() => onSend(trimmed)}
        onCycleSendEmpty={jest.fn()}
        fabColor="#3B82F6"
        iconColor="#fff"
      />
    </View>
  );
}

describe("ComposerFab send", () => {
  it("exposes send control only when draft is non-empty and fires onSendText", async () => {
    const body = `hi-${randomId("body")}`;
    const onSend = jest.fn();
    const user = userEvent.setup();
    render(<MiniComposer onSend={onSend} />);

    expect(screen.queryByLabelText("Send message")).toBeNull();
    expect(screen.getByLabelText("Switch to voice message")).toBeTruthy();

    await user.type(screen.getByPlaceholderText("Type a message..."), body);
    expect(screen.getByLabelText("Send message")).toBeTruthy();

    await user.press(screen.getByLabelText("Send message"));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(body);
  });

  it("cycles empty composer modes via accessibility control", () => {
    const onCycle = jest.fn();
    render(
      <ComposerFab
        isSendOnly={false}
        composerMode="send"
        onSendText={jest.fn()}
        onCycleSendEmpty={onCycle}
        fabColor="#3B82F6"
        iconColor="#fff"
      />,
    );
    fireEvent.press(screen.getByLabelText("Switch to voice message"));
    expect(onCycle).toHaveBeenCalledTimes(1);
  });
});
