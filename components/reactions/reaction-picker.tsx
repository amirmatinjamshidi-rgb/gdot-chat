import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import {
  ALL_REACTIONS,
  QUICK_REACTIONS,
} from "@/components/reactions/types";
import { useColors } from "@/stores/theme-store";

const PICKER_W = 280;
const PICKER_H = 52;
const EMOJI_SIZE = 28;

export type ReactionPickerProps = {
  visible: boolean;
  anchorY: number;
  anchorX: number;
  onSelect: (emoji: string) => void;
  onClose: () => void;
};

export function ReactionPicker({
  visible,
  anchorY,
  anchorX,
  onSelect,
  onClose,
}: ReactionPickerProps) {
  const colors = useColors();
  const { width: screenW } = useWindowDimensions();
  const [showAll, setShowAll] = useState(false);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.85);

  useEffect(() => {
    if (visible) {
      setShowAll(false);
      opacity.value = withTiming(1, { duration: 160 });
      scale.value = withSpring(1, { damping: 14, stiffness: 280 });
    } else {
      opacity.value = withTiming(0, { duration: 120 });
      scale.value = withTiming(0.85, { duration: 120 });
    }
  }, [visible, opacity, scale]);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const left = Math.min(
    Math.max(12, anchorX - PICKER_W / 2),
    screenW - PICKER_W - 12,
  );
  const top = Math.max(80, anchorY - PICKER_H - 12);

  const handlePick = useCallback(
    (emoji: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onSelect(emoji);
      onClose();
    },
    [onClose, onSelect],
  );

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.quickPanel,
            panelStyle,
            {
              left,
              top,
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.surfaceBorder,
            },
          ]}
        >
          {QUICK_REACTIONS.map((emoji) =>
            emoji === "➕" ? (
              <Pressable
                key="more"
                style={styles.emojiBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  setShowAll(true);
                }}
                accessibilityLabel="More reactions"
              >
                <Ionicons
                  name="chevron-down"
                  size={22}
                  color={colors.textMuted}
                />
              </Pressable>
            ) : (
              <Pressable
                key={emoji}
                style={styles.emojiBtn}
                onPress={() => handlePick(emoji)}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </Pressable>
            ),
          )}
        </Animated.View>

        {showAll ? (
          <View
            style={[
              styles.fullSheet,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.surfaceBorder,
              },
            ]}
          >
            <ScrollView
              contentContainerStyle={styles.fullGrid}
              keyboardShouldPersistTaps="handled"
            >
              {ALL_REACTIONS.map((emoji) => (
                <Pressable
                  key={emoji}
                  style={styles.fullEmojiBtn}
                  onPress={() => handlePick(emoji)}
                >
                  <Text style={styles.fullEmoji}>{emoji}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  quickPanel: {
    position: "absolute",
    width: PICKER_W,
    height: PICKER_H,
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingHorizontal: 4,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  emojiBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: {
    fontSize: EMOJI_SIZE,
  },
  fullSheet: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 32,
    maxHeight: "45%",
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 8,
  },
  fullGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    padding: 8,
    gap: 4,
  },
  fullEmojiBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  fullEmoji: {
    fontSize: 30,
  },
});
