import { buildWaveform } from "@/components/voice-waveform";
import { useThemePalette } from "@/providers/theme-palette-provider";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  clamp,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const BAR_COUNT = 34;
const BAR_WIDTH = 2.25;
const BAR_GAP = 2;
const MAX_BAR_HEIGHT = 22;

/** Full horizontal drag to reach slide progress = 1 */
export const SLIDE_CANCEL_DRAG_PX = 88;
/** Release above this progress cancels the recording */
const SLIDE_CANCEL_COMMIT = 0.58;

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
  elapsedMs: number;
  tick: number;
  onSlideCancel: () => void;
};

/**
 * Recording waveform in the composer input with slide-left-to-cancel.
 * While dragging left, the waveform crossfades to a frame-driven chevron hint.
 */
export function RecordingSlideMeter({
  variant,
  elapsedMs,
  tick,
  onSlideCancel,
}: RecordingSlideMeterProps) {
  const { colors } = useThemePalette();
  const seed =
    variant === "voice" ? "voice-recording-meter" : "video-recording-meter";
  const bars = useMemo(() => buildWaveform(seed, BAR_COUNT), [seed]);
  const phase = elapsedMs / 420 + tick * 0.12;

  const slideProgress = useSharedValue(0);
  const flow = useSharedValue(0);

  useFrameCallback((frame) => {
    "worklet";
    const dt = frame.timeSincePreviousFrame ?? 16;
    flow.value += dt * 0.0018;
  });

  const chevronRowStyle = useAnimatedStyle(() => {
    const t = flow.value;
    return {
      transform: [{ translateX: Math.sin(t * 1.15) * 9 }],
      opacity: 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.95)),
    };
  });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          const p = clamp(-e.translationX / SLIDE_CANCEL_DRAG_PX, 0, 1);
          slideProgress.value = p;
        })
        .onEnd(() => {
          if (slideProgress.value >= SLIDE_CANCEL_COMMIT) {
            runOnJS(onSlideCancel)();
          }
          slideProgress.value = withSpring(0, { damping: 18, stiffness: 220 });
        }),
    [onSlideCancel, slideProgress],
  );

  const waveLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slideProgress.value, [0, 0.2, 0.45], [1, 0.45, 0]),
    transform: [
      {
        scaleX: interpolate(slideProgress.value, [0, 1], [1, 0.92]),
      },
    ],
  }));

  const slideLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slideProgress.value, [0.08, 0.28, 1], [0, 1, 1]),
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slideProgress.value, [0.12, 0.3], [0, 1]),
  }));

  const barColor =
    variant === "voice" ? `${colors.primary}CC` : `${colors.tint}CC`;

  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.row}
        accessibilityLabel={
          variant === "voice"
            ? "Voice recording — slide left to cancel"
            : "Video recording — slide left to cancel"
        }
      >
        <View style={styles.meterBody}>
          <Animated.View style={[styles.wave, waveLayerStyle]}>
            {bars.map((base, index) => {
              const wobble =
                0.42 +
                0.58 *
                  Math.sin(
                    phase * 1.15 + index * 0.41 + Math.sin(index) * 0.2,
                  );
              const height = Math.max(4, base * wobble * MAX_BAR_HEIGHT);
              return (
                <View
                  key={index}
                  style={[
                    styles.bar,
                    {
                      height,
                      backgroundColor: barColor,
                    },
                  ]}
                />
              );
            })}
          </Animated.View>

          <Animated.View
            style={[styles.slideOverlay, slideLayerStyle]}
            pointerEvents="none"
          >
            <Animated.View style={[styles.chevronRow, chevronRowStyle]}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Text
                  key={i}
                  style={[styles.chevron, { color: colors.text }]}
                >
                  ‹
                </Text>
              ))}
            </Animated.View>
            <Animated.Text
              style={[styles.slideHint, { color: colors.textMuted }, labelStyle]}
              numberOfLines={1}
            >
              Slide to cancel
            </Animated.Text>
          </Animated.View>
        </View>

        <View style={styles.timerBlock}>
          <View style={[styles.recDot, { backgroundColor: colors.error }]} />
          <Text
            style={[styles.timerText, { color: colors.text }]}
            numberOfLines={1}
          >
            {formatDuration(elapsedMs)}
          </Text>
        </View>
      </View>
    </GestureDetector>
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
  meterBody: {
    flex: 1,
    height: MAX_BAR_HEIGHT + 8,
    justifyContent: "center",
    position: "relative",
  },
  wave: {
    flexDirection: "row",
    alignItems: "center",
    height: MAX_BAR_HEIGHT,
    gap: BAR_GAP,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH,
  },
  slideOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 4,
  },
  chevronRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  chevron: {
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 22,
  },
  slideHint: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
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
