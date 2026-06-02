import { useThemeStore } from "@/stores/theme-store";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0
    ? `${m}:${r.toString().padStart(2, "0")}`
    : `0:${r.toString().padStart(2, "0")}`;
}

type RecordingSlideMeterProps = {
  variant: "voice" | "video";
  locked: boolean;
  elapsedMs: number;
  onSlideCancel: () => void;
};

/**
 * Composer strip while recording: timer only when unlocked (cancel = swipe FAB);
 * locked = borderless glowing Cancel.
 */
export function RecordingSlideMeter({
  variant,
  locked,
  elapsedMs,
  onSlideCancel,
}: RecordingSlideMeterProps) {
  const colors = useThemeStore((state) => state.colors);
  const glowOpacity = useSharedValue(0.7);

  useEffect(() => {
    if (!locked) {
      cancelAnimation(glowOpacity);
      glowOpacity.value = 0.5;
      return;
    }
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.65, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
    return () => cancelAnimation(glowOpacity);
  }, [glowOpacity, locked]);

  const cancelGlowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const timerBlock = (
    <View style={styles.timerBlock}>
      <View style={[styles.recDot, { backgroundColor: colors.error }]} />
      <Text
        style={[styles.timerText, { color: colors.text }]}
        numberOfLines={1}
      >
        {formatDuration(elapsedMs)}
      </Text>
    </View>
  );

  if (locked) {
    return (
      <View
        style={styles.row}
        accessibilityLabel={
          variant === "voice"
            ? "Cancel voice recording"
            : "Cancel video recording"
        }
      >
        <Pressable
          onPress={onSlideCancel}
          hitSlop={12}
          style={({ pressed }) => [
            styles.lockedCancelPress,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Animated.Text
            style={[
              styles.lockedCancelLabel,
              {
                color: colors.error,
                textShadowColor: `${colors.error}80`,
              },
              cancelGlowStyle,
            ]}
          >
            Cancel
          </Animated.Text>
        </Pressable>
        {timerBlock}
      </View>
    );
  }

  return (
    <View
      style={styles.row}
      accessibilityLabel={
        variant === "voice"
          ? "Voice recording in progress"
          : "Video recording in progress"
      }
    >
      <View style={styles.timerSpacer} />
      {timerBlock}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minHeight: 40,
    paddingLeft: 12,
    paddingRight: 10,
    gap: 10,
  },
  timerSpacer: {
    flex: 1,
  },
  lockedCancelPress: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "flex-start",
    backgroundColor: "transparent",
  },
  lockedCancelLabel: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  timerBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  recDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  timerText: {
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
  },
});
