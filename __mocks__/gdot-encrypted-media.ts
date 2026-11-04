import React from "react";
import { View } from "react-native";

export function registerSession() {}
export function unregisterSession() {}
export function clearAll() {}
export function sessionCount() {
  return 0;
}
export function createEncryptedAudioPlayer() {
  return {
    play: async () => undefined,
    pause: async () => undefined,
    seekTo: async () => undefined,
    release: async () => undefined,
    getStatus: async () => ({
      playing: false,
      currentTime: 0,
      duration: 0,
      didJustFinish: false,
    }),
  };
}
export const EncryptedVideo = React.forwardRef(function EncryptedVideoMock(
  props: { attachmentId: string; style?: unknown },
  _ref,
) {
  return React.createElement(View, {
    testID: `encrypted-video-${props.attachmentId}`,
    style: props.style as object,
  });
});
