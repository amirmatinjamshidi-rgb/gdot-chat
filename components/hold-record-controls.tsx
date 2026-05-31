import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { forwardRef, useEffect, useImperativeHandle } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type PanResponderInstance
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useThemePalette } from "@/providers/theme-palette-provider";

const FAB = 44;
const LOCK_SIZE = 40;
const LOCK_LIFT = 72;
const LOCK_DRAG_PX = 56;
const DELETE_SIZE = 38;

export type HoldRecordControlsHandle = {
  /** Snap FAB / lock / pulse animations back after cancel or layout drift. */
  resetLayout: () => void;
};

type HoldRecordControlsProps = {
  mode: "voice" | "video";
  recording: boolean;
  locked: boolean;
  dragY: number;
  elapsedMs: number;
  /** When set (e.g. video clip max), shows remaining time in the timer pill. */
  maxDurationMs?: number;
  /** Hide the floating timer pill (e.g. timer shown in the composer row for voice). */
  hideFloatingTimer?: boolean;
  panHandlers: PanResponderInstance["panHandlers"];
  onSendLocked: () => void;
  onCancelLocked: () => void;
  accentColor?: string;
  iconColor?: string;
};

function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0
    ? `${m}:${r.toString().padStart(2, "0")}`
    : `0:${r.toString().padStart(2, "0")}`;
}

export { LOCK_DRAG_PX };

export const HoldRecordControls = forwardRef<
  HoldRecordControlsHandle,
  HoldRecordControlsProps
>(function HoldRecordControls(
  {
    mode,
    recording,
    locked,
    dragY,
    elapsedMs,
    maxDurationMs,
    hideFloatingTimer = false,
    panHandlers,
    onSendLocked,
    onCancelLocked,
    accentColor = "#C4F542",
    iconColor = "#ffffff",
  },
  ref,
) {
  const { colors } = useThemePalette();
  const holdIcon =
    mode === "voice" ? ("mic.fill" as const) : ("video.fill" as const);
  const dragUp = Math.max(0, -dragY);
  const lockProgress = Math.min(1, dragUp / LOCK_DRAG_PX);
  const lockVisible = recording && !locked && lockProgress > 0.05;
  const lockReached = locked || dragUp >= LOCK_DRAG_PX;

  const fabLift = useSharedValue(0);
  const lockProgSv = useSharedValue(0);
  const recPulse = useSharedValue(1);

  useEffect(() => {
    const target = locked ? 0 : Math.min(0, dragY * 0.35);
    fabLift.value = withTiming(target, {
      duration: locked || dragY === 0 ? 200 : 28,
      easing: Easing.out(Easing.cubic),
    });
  }, [dragY, fabLift, locked]);

  useEffect(() => {
    lockProgSv.value = withTiming(lockReached ? 1 : lockProgress, {
      duration: 140,
      easing: Easing.out(Easing.cubic),
    });
  }, [lockProgSv, lockProgress, lockReached]);

  useEffect(() => {
    if (!recording || locked || hideFloatingTimer) {
      cancelAnimation(recPulse);
      recPulse.value = 1;
      return;
    }
    recPulse.value = withRepeat(
      withSequence(
        withTiming(0.5, {
          duration: 720,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(1, {
          duration: 720,
          easing: Easing.inOut(Easing.quad),
        }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(recPulse);
  }, [hideFloatingTimer, locked, recPulse, recording]);

  useImperativeHandle(
    ref,
    () => ({
      resetLayout: () => {
        fabLift.value = withTiming(0, {
          duration: 220,
          easing: Easing.out(Easing.cubic),
        });
        lockProgSv.value = withTiming(0, {
          duration: 200,
          easing: Easing.out(Easing.cubic),
        });
        cancelAnimation(recPulse);
        recPulse.value = 1;
      },
    }),
    [fabLift, lockProgSv, recPulse],
  );

  const fabAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: fabLift.value }],
  }));

  const lockAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + lockProgSv.value * 0.1 }],
    opacity: locked ? 1 : 0.38 + lockProgSv.value * 0.62,
  }));

  const recDotStyle = useAnimatedStyle(() => ({
    opacity: recPulse.value,
  }));

  const remainingMs =
    maxDurationMs !== undefined ? Math.max(0, maxDurationMs - elapsedMs) : null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      {recording && !hideFloatingTimer ? (
        <View
          style={[
            styles.timerPill,
            {
              backgroundColor: `${colors.surfaceElevated}F2`,
              borderColor: colors.surfaceBorder,
            },
          ]}
          pointerEvents="none"
        >
          <Animated.View style={[styles.recDotWrap, recDotStyle]}>
            <View style={[styles.recDot, { backgroundColor: colors.error }]} />
          </Animated.View>
          {/* <View style={styles.timerTextCol}>
            <Text style={[styles.timerText, { color: colors.text }]}>
              {formatDuration(elapsedMs)}
            </Text>
            {remainingMs !== null ? (
              <Text
                style={[styles.timerSub, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {formatDuration(remainingMs)} left
              </Text>
            ) : null}
          </View> */}
        </View>
      ) : null}

      {locked ? (
        <Pressable
          style={[
            styles.cancelBtn,
            {
              backgroundColor: colors.error,
              borderColor: `${colors.surfaceElevated}CC`,
            },
          ]}
          onPress={onCancelLocked}
          accessibilityLabel="Cancel recording"
        >
          <MaterialIcons name="delete" size={20} color="#FFFFFF" />
        </Pressable>
      ) : null}

      {lockVisible || locked ? (
        <Animated.View
          style={[
            styles.lockTarget,
            lockReached && {
              backgroundColor: accentColor,
              borderColor: accentColor,
            },
            !lockReached && {
              backgroundColor: `${colors.surfaceElevated}E6`,
              borderColor: colors.surfaceBorder,
            },
            lockAnimStyle,
          ]}
          pointerEvents="none"
        >
          <MaterialIcons
            name={lockReached ? "lock" : "lock-open"}
            size={20}
            color={lockReached ? iconColor : colors.textMuted}
          />
        </Animated.View>
      ) : null}

      <View style={styles.fabWrap} {...panHandlers}>
        <Animated.View style={fabAnim}>
          {locked ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send recording"
              style={[
                styles.actionFab,
                styles.actionFabLocked,
                { backgroundColor: accentColor },
              ]}
              onPress={onSendLocked}
            >
              <MaterialIcons name="send" size={22} color={iconColor} />
            </Pressable>
          ) : (
            <View
              accessibilityRole="button"
              accessibilityLabel={
                mode === "voice"
                  ? "Hold to record voice message"
                  : "Hold to record video message"
              }
              style={[styles.actionFab, { backgroundColor: accentColor }]}
            >
              <IconSymbol name={holdIcon} size={22} color={iconColor} />
            </View>
          )}
        </Animated.View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: 260,
    height: FAB + LOCK_LIFT + DELETE_SIZE + 12,
    alignItems: "flex-end",
    justifyContent: "flex-end",
  },
  timerPill: {
    position: "absolute",
    right: FAB + 10,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 200,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  recDotWrap: {
    justifyContent: "center",
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timerTextCol: {
    flexShrink: 1,
  },
  timerText: {
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  timerSub: {
    fontSize: 11,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    marginTop: 1,
  },
  cancelBtn: {
    position: "absolute",
    bottom: FAB + 18 + LOCK_SIZE + 10,
    width: DELETE_SIZE,
    height: DELETE_SIZE,
    borderRadius: DELETE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  lockTarget: {
    position: "absolute",
    bottom: FAB + 18,
    width: LOCK_SIZE,
    height: LOCK_SIZE,
    borderRadius: LOCK_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabWrap: {
    width: FAB,
    height: FAB,
  },
  actionFab: {
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  actionFabLocked: {},
});
