import React from "react";
import { Pressable, StyleSheet } from "react-native";

import { DualIconCrossfade } from "@/components/dual-icon-crossfade";

export type ComposerMode = "send" | "voice" | "video";

export type ComposerFabProps = {
  isSendOnly: boolean;
  composerMode: ComposerMode;
  onSendText: () => void;
  onCycleSendEmpty: () => void;
  fabColor: string;
  iconColor: string;
};

export function ComposerFab({
  isSendOnly,
  composerMode,
  onSendText,
  onCycleSendEmpty,
  fabColor,
  iconColor,
}: ComposerFabProps) {
  if (isSendOnly) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send message"
        style={[styles.actionFab, { backgroundColor: fabColor }]}
        onPress={onSendText}
      >
        <DualIconCrossfade active="send" size={22} color={iconColor} />
      </Pressable>
    );
  }

  if (composerMode === "send") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Switch to voice message"
        style={[styles.actionFab, { backgroundColor: fabColor }]}
        onPress={onCycleSendEmpty}
      >
        <DualIconCrossfade active="send" size={22} color={iconColor} />
      </Pressable>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  actionFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
