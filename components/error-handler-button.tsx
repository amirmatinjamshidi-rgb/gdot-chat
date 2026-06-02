import React, { useEffect } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useThemeStore, useColors } from "@/stores/theme-store";

type ErrorHandlerButtonProps = {
  /** Shown when a gesture was too short (e.g. under one second). */
  message: string | null;
  /** Called after auto-dismiss or when the user taps the banner. */
  onDismiss: () => void;
};

/**
 * Modal-style error surface for the chat composer (backdrop + card).
 */
export function ErrorHandlerButton({ message, onDismiss }: ErrorHandlerButtonProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const cardMax = Math.min(360, width - 48);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, 4500);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  return (
    <Modal
      visible={!!message}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: "rgba(0,0,0,0.45)" }]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss error"
        />
        <View style={styles.centerWrap} pointerEvents="box-none">
          <View
            style={[
              styles.card,
              {
                maxWidth: cardMax,
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.surfaceBorder,
                shadowColor: colors.text,
              },
            ]}
          >
            <View
              style={[styles.accentBar, { backgroundColor: colors.error }]}
            />
            <Pressable
              onPress={onDismiss}
              accessibilityRole="alert"
              style={styles.cardInner}
            >
              <ThemedText
                style={[styles.title, { color: colors.text }]}
                lightColor={colors.text}
                darkColor={colors.text}
              >
                Heads up
              </ThemedText>
              <ThemedText
                style={[styles.body, { color: colors.textSecondary }]}
                lightColor={colors.textSecondary}
                darkColor={colors.textSecondary}
              >
                {message ?? ""}
              </ThemedText>
              <ThemedText
                style={[styles.tapHint, { color: colors.tint }]}
                lightColor={colors.tint}
                darkColor={colors.tint}
              >
                Tap anywhere to dismiss
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  accentBar: {
    height: 4,
    width: "100%",
  },
  cardInner: {
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  tapHint: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: "600",
  },
});
