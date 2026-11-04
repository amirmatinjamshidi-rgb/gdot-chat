import React from "react";
import { render } from "@testing-library/react-native";

jest.unmock("@/components/video-message-bubble");
jest.unmock("@/components/voice-message-bubble");

jest.mock("gdot-encrypted-media", () => {
  const ReactLocal = require("react");
  const { View: RNView } = require("react-native");
  return {
    registerSession: jest.fn(),
    unregisterSession: jest.fn(),
    clearAll: jest.fn(),
    sessionCount: () => 0,
    createEncryptedAudioPlayer: () => ({
      play: jest.fn(async () => undefined),
      pause: jest.fn(async () => undefined),
      seekTo: jest.fn(async () => undefined),
      release: jest.fn(async () => undefined),
      getStatus: jest.fn(async () => ({
        playing: false,
        currentTime: 0,
        duration: 0,
        didJustFinish: false,
      })),
    }),
    EncryptedVideo: ReactLocal.forwardRef(function EncryptedVideoMock(
      props: { attachmentId: string },
      _ref: unknown,
    ) {
      return ReactLocal.createElement(RNView, {
        testID: `encrypted-video-${props.attachmentId}`,
      });
    }),
  };
});

jest.mock("@/components/voice-waveform-skia", () => ({
  VoiceWaveformSkia: () => null,
}));
jest.mock("@/components/circular-progress-ring", () => ({
  CircularProgressRing: () => null,
}));
jest.mock("@/stores/theme-store", () => ({
  useColors: () => ({
    primary: "#00f",
    onPrimary: "#fff",
    tint: "#0af",
    text: "#000",
    textMuted: "#888",
    textSecondary: "#666",
    surfaceBorder: "#ccc",
    surfaceElevated: "#eee",
    background: "#fff",
  }),
  useThemeStore: (sel: (s: { mode: string }) => unknown) =>
    typeof sel === "function" ? sel({ mode: "light" }) : { mode: "light" },
}));
jest.mock("expo-blur", () => {
  const { View: RNView } = require("react-native");
  return { BlurView: RNView };
});

const {
  VideoMessageBubble,
} = require("@/components/video-message-bubble") as typeof import("@/components/video-message-bubble");
const {
  VoiceMessageBubble,
} = require("@/components/voice-message-bubble") as typeof import("@/components/voice-message-bubble");

describe("encrypted media bubbles (mocked native module)", () => {
  it("renders EncryptedVideo for encrypted video attachment", () => {
    const { getByTestId } = render(
      <VideoMessageBubble
        encrypted
        attachmentId="att-vid-1"
        isMine
        isActive={false}
        onActivate={() => undefined}
        onDeactivate={() => undefined}
      />,
    );
    expect(getByTestId("encrypted-video-att-vid-1")).toBeTruthy();
  });

  it("renders encrypted voice controls without plaintext uri", () => {
    const { getByLabelText } = render(
      <VoiceMessageBubble
        encrypted
        attachmentId="att-voice-1"
        seed="seed"
        isMine={false}
        isActive={false}
        onActivate={() => undefined}
        onDeactivate={() => undefined}
      />,
    );
    expect(getByLabelText("Play voice message")).toBeTruthy();
  });
});
