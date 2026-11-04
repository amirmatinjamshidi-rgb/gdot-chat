import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";

import { TextMessageBubble } from "@/components/reactions/text-message-bubble";
import { ThemedText } from "@/components/themed-text";
import {
  VIDEO_BUBBLE_PLAY_SCALE,
  VIDEO_BUBBLE_SIZE,
  VideoMessageBubble,
} from "@/components/video-message-bubble";
import { VoiceMessageBubble } from "@/components/voice-message-bubble";
import { formatMediaDuration } from "@/lib/chat/format-duration";
import type { Message } from "@/stores/messages-store";
import { useColors, useThemeStore } from "@/stores/theme-store";

const VIDEO_BUBBLE_PLAYING_MIN_HEIGHT = Math.max(
  160,
  Math.ceil(VIDEO_BUBBLE_SIZE * VIDEO_BUBBLE_PLAY_SCALE) + 28,
);

export type ChatMessageRowProps = {
  item: Message;
  currentUserId: string;
  /** Whether this row's media is the active playback target. */
  isActive: boolean;
  highlightEmoji?: string | null;
  onLongPress: (messageId: string, layout: { x: number; y: number }) => void;
  onReactionPress: (messageId: string, emoji: string) => void;
  onActivatePlayback: (messageId: string) => void;
  onDeactivatePlayback: (messageId: string) => void;
  onDownloadMedia: (attachmentId: string) => void;
  /** Optional footer under the bubble (e.g. group receipt aggregate). */
  footer?: React.ReactNode;
  /** Optional label above bubble (e.g. group sender name). */
  header?: React.ReactNode;
};

function ChatMessageRowImpl({
  item,
  currentUserId,
  isActive,
  highlightEmoji = null,
  onLongPress,
  onReactionPress,
  onActivatePlayback,
  onDeactivatePlayback,
  onDownloadMedia,
  footer,
  header,
}: ChatMessageRowProps) {
  const colors = useColors();
  const mode = useThemeStore((s) => s.mode);
  const isDark = mode === "dark";

  const isMyVideo = item.kind === "video" && item.sender === "me";
  const isMyVoice = item.kind === "voice" && item.sender === "me";
  const isMediaBubble = item.kind === "video" || item.kind === "voice";
  const bubbleBg = isMediaBubble
    ? "transparent"
    : item.sender === "me"
      ? colors.primary
      : colors.surfaceElevated;
  const primaryColor =
    item.sender === "me" && !isMediaBubble ? colors.onPrimary : colors.text;
  const timeColor = isMyVideo
    ? isDark
      ? "rgba(148,163,184,0.95)"
      : "rgba(71,85,105,0.9)"
    : isMyVoice
      ? "rgba(203,213,225,0.75)"
      : item.sender === "me"
        ? "rgba(255,255,255,0.7)"
        : "rgba(0,0,0,0.5)";

  const bubbleAlign: ViewStyle[] = [
    styles.messageBubble,
    item.sender === "me" ? styles.myMessage : styles.theirMessage,
  ];

  if (item.kind === "text") {
    return (
      <View>
        {header}
        <TextMessageBubble
          messageId={item.id}
          text={item.text ?? ""}
          time={item.time}
          isMine={item.isMine ?? item.sender === "me"}
          deliveryStatus={item.deliveryStatus}
          primaryColor={primaryColor}
          timeColor={timeColor}
          bubbleStyle={[
            ...bubbleAlign,
            {
              backgroundColor: bubbleBg,
              borderWidth: item.sender === "me" ? 0 : 1,
              borderColor: colors.surfaceBorder,
            },
          ]}
          reactions={item.reactions ?? []}
          myId={currentUserId}
          highlightEmoji={highlightEmoji}
          onLongPress={onLongPress}
          onReactionPress={onReactionPress}
        />
        {footer}
      </View>
    );
  }

  return (
    <View>
      {header}
      <View
        style={[
          ...bubbleAlign,
          isMyVideo && styles.myVideoBubble,
          item.kind === "video" && styles.videoMessageBubble,
          isMyVoice && styles.myVoiceBubble,
          {
            backgroundColor: bubbleBg,
            borderWidth: item.sender === "me" || isMediaBubble ? 0 : 1,
            borderColor: colors.surfaceBorder,
          },
        ]}
      >
        {item.kind === "voice" && (item.mediaUri || (item.encryptedPlayback && item.attachmentId)) ? (
          <VoiceMessageBubble
            uri={item.mediaUri}
            attachmentId={item.attachmentId}
            encrypted={!!item.encryptedPlayback}
            seed={item.id}
            durationMs={item.durationMs}
            isMine={item.isMine ?? item.sender === "me"}
            isActive={isActive}
            onActivate={() => onActivatePlayback(item.id)}
            onDeactivate={() => onDeactivatePlayback(item.id)}
          />
        ) : null}
        {item.kind === "video" && (item.mediaUri || (item.encryptedPlayback && item.attachmentId)) ? (
          <View
            style={[
              styles.videoBubbleWrap,
              isActive && styles.videoBubbleWrapPlaying,
            ]}
          >
            <VideoMessageBubble
              uri={item.mediaUri}
              attachmentId={item.attachmentId}
              encrypted={!!item.encryptedPlayback}
              isMine={item.sender === "me"}
              durationMs={item.durationMs}
              isActive={isActive}
              onActivate={() => onActivatePlayback(item.id)}
              onDeactivate={() => onDeactivatePlayback(item.id)}
            />
          </View>
        ) : null}
        {isMediaBubble && !item.mediaUri && !item.encryptedPlayback ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              item.transferState === "uploading"
                ? "Uploading media"
                : item.transferState === "downloading"
                  ? "Downloading media"
                  : "Download media"
            }
            testID={`media-transfer-${item.id}`}
            onPress={() => {
              if (!item.attachmentId) return;
              if (
                item.transferState === "uploading" ||
                item.transferState === "downloading"
              ) {
                return;
              }
              onDownloadMedia(item.attachmentId);
            }}
            style={styles.mediaTransferCard}
          >
            {(item.transferState === "uploading" ||
              item.transferState === "downloading") && (
              <ActivityIndicator color={colors.primary} />
            )}
            <ThemedText style={{ color: colors.text }}>
              {item.transferState === "uploading"
                ? "Uploading…"
                : item.transferState === "downloading"
                  ? "Downloading…"
                  : item.transferState === "failed" ||
                      item.transferState === "download_failed"
                    ? "Tap to retry download"
                    : item.kind === "voice"
                      ? "Voice message — tap to download"
                      : "Video message — tap to download"}
            </ThemedText>
            {item.durationMs ? (
              <ThemedText style={[styles.timeText, { color: timeColor }]}>
                {formatMediaDuration(item.durationMs)}
              </ThemedText>
            ) : null}
          </Pressable>
        ) : null}
        <ThemedText style={[styles.timeText, { color: timeColor }]}>
          {item.time}
        </ThemedText>
      </View>
      {footer}
    </View>
  );
}


export const ChatMessageRow = React.memo(ChatMessageRowImpl);
ChatMessageRow.displayName = "ChatMessageRow";

const styles = StyleSheet.create({
  myVideoBubble: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 6,
    overflow: "visible",
  },
  videoMessageBubble: {
    overflow: "visible",
  },
  myVoiceBubble: {
    paddingHorizontal: 2,
    paddingTop: 2,
    paddingBottom: 4,
    backgroundColor: "transparent",
    overflow: "visible",
  },
  messageBubble: {
    padding: 4,
    borderRadius: 10,
    maxWidth: "80%",
  },
  myMessage: {
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  theirMessage: {
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
  },
  timeText: {
    fontSize: 10,
    alignSelf: "flex-end",
    marginTop: 4,
  },
  videoBubbleWrap: {
    marginBottom: 12,
    alignItems: "center",
    backgroundColor: "transparent",
    overflow: "visible",
    minHeight: VIDEO_BUBBLE_SIZE + 16,
  },
  videoBubbleWrapPlaying: {
    minHeight: VIDEO_BUBBLE_PLAYING_MIN_HEIGHT,
    marginVertical: 40,
  },
  mediaTransferCard: {
    minWidth: 160,
    maxWidth: 240,
    padding: 12,
    gap: 8,
    borderRadius: 12,
    alignItems: "flex-start",
  },
});
