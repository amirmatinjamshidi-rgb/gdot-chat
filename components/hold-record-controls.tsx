import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useEffect } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PanResponderInstance,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { IconSymbol } from "@/components/ui/icon-symbol";

const FAB = 44;
const LOCK_SIZE = 40;
const LOCK_LIFT = 72;
const LOCK_DRAG_PX = 56;
const DELETE_SIZE = 38;

type HoldRecordControlsProps = {
  mode: "voice" | "video";
  recording: boolean;
  locked: boolean;
  dragY: number;
  elapsedMs: number;
  panHandlers: PanResponderInstance["panHandlers"];
  onSendLocked: () => void;
  onCancelLocked: () => void;
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

export function HoldRecordControls({
  mode,
  recording,
  locked,
  dragY,
  elapsedMs,
  panHandlers,
  onSendLocked,
  onCancelLocked,
}: HoldRecordControlsProps) {
  const holdIcon = mode === "voice" ? ("mic.fill" as const) : ("video.fill" as const);
  const dragUp = Math.max(0, -dragY);
  const lockProgress = Math.min(1, dragUp / LOCK_DRAG_PX);
  const lockVisible = recording && !locked && lockProgress > 0.05;
  const lockReached = locked || dragUp >= LOCK_DRAG_PX;

  const fabLift = useSharedValue(0);

  useEffect(() => {
    const target = locked ? 0 : Math.min(0, dragY * 0.35);
    const duration = locked || dragY === 0 ? 120 : 16;
    fabLift.value = withTiming(target, { duration });
  }, [dragY, fabLift, locked]);

  const fabAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: fabLift.value }],
  }));

  return (
    <View style={styles.root} pointerEvents="box-none">
      {recording ? (
        <View style={styles.timerPill} pointerEvents="none">
          <View style={styles.recDot} />
          <Text style={styles.timerText}>{formatDuration(elapsedMs)}</Text>
        </View>
      ) : null}

      {locked ? (
        <Pressable
          style={styles.cancelBtn}
          onPress={onCancelLocked}
          accessibilityLabel="Cancel recording"
        >
          <MaterialIcons name="delete" size={20} color="#fff" />
        </Pressable>
      ) : null}

      {lockVisible || locked ? (
        <View
          style={[
            styles.lockTarget,
            lockReached && styles.lockTargetActive,
            { opacity: locked ? 1 : 0.35 + lockProgress * 0.65 },
          ]}
          pointerEvents="none"
        >
          <MaterialIcons
            name={lockReached ? "lock" : "lock-open"}
            size={20}
            color={lockReached ? "#fff" : "#94a3b8"}
          />
        </View>
      ) : null}

      <View style={styles.fabWrap} {...panHandlers}>
        <Animated.View style={fabAnim}>
          {locked ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send recording"
              style={[styles.actionFab, styles.actionFabLocked]}
              onPress={onSendLocked}
            >
              <MaterialIcons name="send" size={22} color="#fff" />
            </Pressable>
          ) : (
            <View
              accessibilityRole="button"
              accessibilityLabel={
                mode === "voice"
                  ? "Hold to record voice message"
                  : "Hold to record video message"
              }
              style={styles.actionFab}
            >
              <IconSymbol name={holdIcon} size={22} color="#fff" />
            </View>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: FAB,
    height: FAB + LOCK_LIFT + DELETE_SIZE + 12,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  timerPill: {
    position: "absolute",
    right: FAB + 10,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.88)",
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },
  timerText: {
    color: "#f8fafc",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  cancelBtn: {
    position: "absolute",
    bottom: FAB + 18 + LOCK_SIZE + 10,
    width: DELETE_SIZE,
    height: DELETE_SIZE,
    borderRadius: DELETE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.92)",
  },
  lockTarget: {
    position: "absolute",
    bottom: FAB + 18,
    width: LOCK_SIZE,
    height: LOCK_SIZE,
    borderRadius: LOCK_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(30,41,59,0.92)",
    borderWidth: 1.5,
    borderColor: "rgba(148,163,184,0.45)",
  },
  lockTargetActive: {
    backgroundColor: "#3B82F6",
    borderColor: "#60a5fa",
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
    backgroundColor: "#C4F542",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  actionFabLocked: {
    backgroundColor: "#3B82F6",
  },
});
