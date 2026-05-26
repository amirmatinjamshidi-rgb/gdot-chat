import { AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { CircularProgressRing } from "@/components/circular-progress-ring";

export const VIDEO_BUBBLE_SIZE = 160;
const PLAY_SCALE = 1.5;
const PLAY_SHIFT = 44;
const PLAY_MS = 200;

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
  const videoRef = useRef<Video>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const playShift = isMine ? -PLAY_SHIFT : PLAY_SHIFT;

  const resetPlayback = useCallback(async () => {
    scale.value = withTiming(1, { duration: PLAY_MS });
    translateX.value = withTiming(0, { duration: PLAY_MS });
    setPlaying(false);
    setProgress(0);
    try {
      await videoRef.current?.pauseAsync();
      await videoRef.current?.setPositionAsync(0);
    } catch {
      /* noop */
    }
  }, [scale, translateX]);

  useEffect(() => {
    if (!isActive && playing) {
      void resetPlayback();
    }
  }, [isActive, playing, resetPlayback]);

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      const duration =
        status.durationMillis ??
        durationMs ??
        (status.positionMillis > 0 ? status.positionMillis : 1);
      const position = status.positionMillis ?? 0;
      setProgress(Math.min(1, position / Math.max(duration, 1)));

      if (status.didJustFinish) {
        void resetPlayback();
        onDeactivate();
      }
    },
    [durationMs, onDeactivate, resetPlayback],
  );

  const togglePlayback = useCallback(async () => {
    const player = videoRef.current;
    if (!player) return;

    if (playing) {
      await player.pauseAsync();
      scale.value = withTiming(1, { duration: PLAY_MS });
      translateX.value = withTiming(0, { duration: PLAY_MS });
      setPlaying(false);
      onDeactivate();
      return;
    }

    onActivate();
    await player.playAsync();
    scale.value = withTiming(PLAY_SCALE, { duration: PLAY_MS });
    translateX.value = withTiming(playShift, { duration: PLAY_MS });
    setPlaying(true);
  }, [onActivate, onDeactivate, playShift, playing, scale, translateX]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { scale: scale.value },
    ],
    zIndex: scale.value > 1.05 ? 20 : 1,
  }));

  const ringSize = VIDEO_BUBBLE_SIZE + 10;
  const strokeWidth = 1.5;

  return (
    <Pressable
      onPress={() => void togglePlayback()}
      accessibilityRole="button"
      accessibilityLabel={
        playing ? "Pause video message" : "Play video message"
      }
      style={styles.pressable}
    >
      <Animated.View style={[styles.outer, animStyle]}>
        {(playing || progress > 0) && (
          <CircularProgressRing
            size={ringSize}
            stroke={4}
            progress={progress}
            fillColor={isMine ? "#5cf9e8" : "#60a5fa"}
            trackColor="rgba(148,163,184,0.3)"
          />
        )}
        <View
          style={[
            styles.videoRing,
            isMine && styles.videoRingMine,
            playing && styles.videoRingPlaying,
          ]}
        >
          <Video
            ref={videoRef}
            source={{ uri }}
            style={styles.video}
            resizeMode={ResizeMode.COVER}
            isLooping={false}
            shouldPlay={false}
            useNativeControls={false}
            onPlaybackStatusUpdate={onPlaybackStatusUpdate}
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
    borderColor: "rgba(148,163,184,0.55)",
  },
  videoRingMine: {
    borderColor: "rgba(92,249,232,0.85)",
  },
  videoRingPlaying: {
    borderColor: "#5cf9e8",
  },
  video: {
    width: VIDEO_BUBBLE_SIZE,
    height: VIDEO_BUBBLE_SIZE,
  },
});
