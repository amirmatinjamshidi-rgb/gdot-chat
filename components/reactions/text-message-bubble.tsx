import * as Haptics from "expo-haptics";
import { useRef } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";

import { ReactionList } from "@/components/reactions/reaction-list";
import type { Reaction } from "@/components/reactions/types";
import { ThemedText } from "@/components/themed-text";

export type TextMessageBubbleProps = {
  messageId: string;
  text: string;
  time: string;
  isMine: boolean;
  primaryColor: string;
  timeColor: string;
  bubbleStyle: ViewStyle[];
  reactions: Reaction[];
  myId: string;
  highlightEmoji?: string | null;
  onLongPress: (messageId: string, layout: { x: number; y: number }) => void;
  onReactionPress: (messageId: string, emoji: string) => void;
};

export function TextMessageBubble({
  messageId,
  text,
  time,
  isMine,
  primaryColor,
  timeColor,
  bubbleStyle,
  reactions,
  myId,
  highlightEmoji,
  onLongPress,
  onReactionPress,
}: TextMessageBubbleProps) {
  const wrapRef = useRef<View>(null);

  return (
    <View
      style={[styles.wrap, isMine ? styles.wrapMine : styles.wrapTheirs]}
    >
      <Pressable
        ref={wrapRef}
        delayLongPress={300}
        onLongPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          wrapRef.current?.measureInWindow((x, y, _w, h) => {
            onLongPress(messageId, { x: x + (isMine ? _w : 0), y: y + h / 2 });
          });
        }}
        style={bubbleStyle}
      >
        <ThemedText style={{ color: primaryColor }}>{text}</ThemedText>
        <ThemedText style={[styles.timeText, { color: timeColor }]}>
          {time}
        </ThemedText>
      </Pressable>
      <ReactionList
        reactions={reactions}
        myId={myId}
        highlightEmoji={highlightEmoji}
        onPress={(emoji) => onReactionPress(messageId, emoji)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    maxWidth: "82%",
  },
  wrapMine: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  wrapTheirs: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
  },
  timeText: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: "flex-end",
  },
});
