import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";

import type { Reaction } from "@/components/reactions/types";
import { useColors } from "@/stores/theme-store";

export type ReactionListProps = {
  reactions: Reaction[];
  myId: string;
  onPress: (emoji: string) => void;
  /** Brief pop on the emoji the user just picked */
  highlightEmoji?: string | null;
};

function ReactionChip({
  reaction,
  mine,
  onPress,
  highlight,
}: {
  reaction: Reaction;
  mine: boolean;
  onPress: () => void;
  highlight: boolean;
}) {
  const colors = useColors();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (highlight) {
      scale.value = withSequence(
        withSpring(1.35, { damping: 8, stiffness: 400 }),
        withSpring(1, { damping: 12, stiffness: 320 }),
      );
    }
  }, [highlight, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable onPress={onPress}>
      <Animated.View
        style={[
          styles.chip,
          {
            backgroundColor: mine
              ? "rgba(59,130,246,0.14)"
              : colors.surfaceElevated,
            borderColor: mine ? colors.primary : colors.surfaceBorder,
          },
          animStyle,
        ]}
      >
        <Text style={styles.emoji}>{reaction.emoji}</Text>
        <Text
          style={[
            styles.count,
            { color: mine ? colors.primary : colors.textMuted },
          ]}
        >
          {reaction.count}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function ReactionList({
  reactions,
  myId,
  onPress,
  highlightEmoji,
}: ReactionListProps) {
  if (!reactions?.length) return null;

  const visible = reactions.filter((r) => r.count > 0);
  if (!visible.length) return null;

  return (
    <View style={styles.row}>
      {visible.map((r) => {
        const mine = r.users.includes(myId);
        return (
          <ReactionChip
            key={r.emoji}
            reaction={r}
            mine={mine}
            highlight={highlightEmoji === r.emoji}
            onPress={() => onPress(r.emoji)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
    marginBottom: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  emoji: {
    fontSize: 14,
  },
  count: {
    fontSize: 12,
    fontWeight: "600",
  },
});
