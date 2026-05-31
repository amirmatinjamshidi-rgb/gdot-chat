import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { CircularProgressRing } from "@/components/circular-progress-ring";
import { useThemePalette } from "@/providers/theme-palette-provider";

export const VIDEO_BUBBLE_SIZE = 160;
const PLAY_SCALE = 1.7;
const PLAY_SHIFT = 80;
const PLAY_MS = 170;
const EASE = Easing.out(Easing.cubic);

type VideoMessageBubbleProps = {
  uri: string;
  isMine: boolean;
  durationMs?: number;
  isActive: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
};

export function VideoMessageBubble({
  uri,
  isMine,
  durationMs,
  isActive,
  onActivate,
  onDeactivate,
}: VideoMessageBubbleProps) {
  const { colors } = useThemePalette();
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const playShift = isMine ? -PLAY_SHIFT : PLAY_SHIFT;

  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.016;
  });

  const resetPlayback = useCallback(() => {
    scale.value = withTiming(1, { duration: PLAY_MS, easing: EASE });
    translateX.value = withTiming(0, { duration: PLAY_MS, easing: EASE });
    setPlaying(false);
    setProgress(0);
    player.pause();
    player.currentTime = 0;
  }, [player, scale, translateX]);

  useEffect(() => {
    if (!isActive && playing) {
      resetPlayback();
    }
  }, [isActive, playing, resetPlayback]);

  useEventListener(player, "timeUpdate", () => {
    const durationSec =
      player.duration > 0
        ? player.duration
        : durationMs
          ? durationMs / 1000
          : 1;
    setProgress(Math.min(1, player.currentTime / Math.max(durationSec, 0.001)));
  });

  useEventListener(player, "playToEnd", () => {
    resetPlayback();
    onDeactivate();
  });

  const togglePlayback = useCallback(() => {
    if (playing) {
      player.pause();
      scale.value = withTiming(1, { duration: PLAY_MS, easing: EASE });
      translateX.value = withTiming(0, { duration: PLAY_MS, easing: EASE });
      setPlaying(false);
      onDeactivate();
      return;
    }

    onActivate();
    player.play();
    scale.value = withTiming(PLAY_SCALE, { duration: PLAY_MS, easing: EASE });
    translateX.value = withTiming(playShift, {
      duration: PLAY_MS,
      easing: EASE,
    });
    setPlaying(true);
  }, [onActivate, onDeactivate, playShift, player, playing, scale, translateX]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: scale.value }],
    zIndex: scale.value > 1.05 ? 20 : 1,
  }));

  const ringSize = VIDEO_BUBBLE_SIZE + 10;
  const progressFill = isMine ? colors.primary : colors.tint;
  const trackColor = `${colors.textMuted}4D`;

  return (
    <Pressable
      onPress={togglePlayback}
      accessibilityRole="button"
      accessibilityLabel={
        playing ? "Pause video message" : "Play video message"
      }
      style={({ pressed }) => [styles.pressable, pressed && { opacity: 0.92 }]}
    >
      <Animated.View
        style={[
          styles.outer,
          animStyle,
          {
            shadowColor: colors.text,
            shadowOpacity: playing ? 0.14 : 0.06,
            shadowRadius: playing ? 16 : 8,
            shadowOffset: { width: 0, height: playing ? 6 : 3 },
            elevation: playing ? 8 : 3,
          },
        ]}
      >
        {(playing || progress > 0) && (
          <CircularProgressRing
            size={ringSize}
            stroke={4}
            progress={progress}
            fillColor={progressFill}
            trackColor={trackColor}
          />
        )}
        <View
          style={[
            styles.videoRing,
            // {
            //   borderColor: isMine
            //     ? `${colors.primary}D9`
            //     : `${colors.surfaceBorder}E6`,
            // },
            // playing && {
            //   borderColor: progressFill,
            // },
          ]}
        >
          <VideoView
            player={player}
            style={styles.video}
            contentFit="cover"
            nativeControls={false}
            surfaceType={Platform.OS === "android" ? "textureView" : undefined}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    overflow: "visible",
  },
  outer: {
    width: VIDEO_BUBBLE_SIZE + 10,
    height: VIDEO_BUBBLE_SIZE + 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  videoRing: {
    width: VIDEO_BUBBLE_SIZE,
    height: VIDEO_BUBBLE_SIZE,
    borderRadius: VIDEO_BUBBLE_SIZE / 2,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 2,
  },
  video: {
    width: VIDEO_BUBBLE_SIZE,
    height: VIDEO_BUBBLE_SIZE,
  },
});
