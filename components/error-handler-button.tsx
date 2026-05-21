import React, { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";

type ErrorHandlerButtonProps = {
  /** Shown above the composer when a gesture was too short (e.g. under one second). */
  message: string | null;
  /** Called after auto-dismiss or when the user taps the banner. */
  onDismiss: () => void;
};

/**
 * Small inline error surface for the chat composer (short hold, wrong gesture, etc.).
 */
export function ErrorHandlerButton({ message, onDismiss }: ErrorHandlerButtonProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, 4500);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) {
    return null;
  }

  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.wrap}>
      <Pressable onPress={onDismiss} accessibilityRole="alert">
        <View style={styles.inner}>
          <ThemedText style={styles.text}>{message}</ThemedText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "stretch",
    marginBottom: 6,
  },
  inner: {
    alignSelf: "center",
    maxWidth: "92%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.78)",
  },
  text: {
    color: "#fff",
    fontSize: 13,
    textAlign: "center",
  },
});
