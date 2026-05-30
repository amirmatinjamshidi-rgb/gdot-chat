import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { BlurView } from "expo-blur";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import React, { useCallback, useEffect } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { VoiceWaveform } from "@/components/voice-waveform";
import { useThemePalette } from "@/providers/theme-palette-provider";

const ICON_MS = 200;

type VoiceMessageBubbleProps = {
  uri: string;
  seed: string;
  durationMs?: number;
  isMine: boolean;
  isActive: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
};

function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0
    ? `${m}:${r.toString().padStart(2, "0")}`
    : `0:${r.toString().padStart(2, "0")}`;
}

export function VoiceMessageBubble({
  uri,
  seed,
  durationMs,
  isMine,
  isActive,
  onActivate,
  onDeactivate,
}: VoiceMessageBubbleProps) {
  const { colors, mode } = useThemePalette();
  const player = useAudioPlayer(uri, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  const playOpacity = useSharedValue(1);
  const pauseOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(1);

  const durationSec =
    status.duration > 0
      ? status.duration
      : durationMs
        ? durationMs / 1000
        : 0;
  const progress =
    durationSec > 0 ? Math.min(1, status.currentTime / durationSec) : 0;
  const playing = status.playing;

  const resetPlayback = useCallback(() => {
    player.pause();
    player.seekTo(0);
    playOpacity.value = withTiming(1, { duration: ICON_MS });
    pauseOpacity.value = withTiming(0, { duration: ICON_MS });
  }, [pauseOpacity, playOpacity, player]);

  useEffect(() => {
    if (!isActive && playing) {
      resetPlayback();
    }
  }, [isActive, playing, resetPlayback]);

  useEffect(() => {
    if (status.didJustFinish) {
      resetPlayback();
      onDeactivate();
    }
  }, [status.didJustFinish, onDeactivate, resetPlayback]);

  useEffect(() => {
    if (playing) {
      playOpacity.value = withTiming(0, { duration: ICON_MS });
      pauseOpacity.value = withTiming(1, { duration: ICON_MS });
      return;
    }
    playOpacity.value = withTiming(1, { duration: ICON_MS });
    pauseOpacity.value = withTiming(0, { duration: ICON_MS });
  }, [pauseOpacity, playOpacity, playing]);

  const togglePlayback = useCallback(async () => {
    buttonScale.value = withSequence(
      withTiming(0.94, { duration: 70 }),
      withTiming(1, { duration: 130 }),
    );

    if (playing) {
      player.pause();
      onDeactivate();
      return;
    }

    onActivate();
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    });
    player.play();
  }, [buttonScale, onActivate, onDeactivate, player, playing]);

  const seekToProgress = useCallback(
    (next: number) => {
      if (durationSec <= 0) return;
      player.seekTo(next * durationSec);
      if (!playing) {
        onActivate();
        void setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        }).then(() => player.play());
      }
    },
    [durationSec, onActivate, player, playing],
  );

  const playIconStyle = useAnimatedStyle(() => ({
    opacity: playOpacity.value,
    transform: [{ scale: 0.85 + playOpacity.value * 0.15 }],
  }));

  const pauseIconStyle = useAnimatedStyle(() => ({
    opacity: pauseOpacity.value,
    transform: [{ scale: 0.85 + pauseOpacity.value * 0.15 }],
  }));

  const buttonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const elapsedMs =
    status.currentTime > 0
      ? status.currentTime * 1000
      : playing
        ? 0
        : durationMs ?? 0;
  const displayMs = playing ? elapsedMs : durationMs ?? elapsedMs;

  const shellBorder = isMine
    ? `${colors.primary}66`
    : `${colors.surfaceBorder}CC`;
  const blurTint = mode === "dark" ? "dark" : "light";

  const glass = (
    <View style={styles.content}>
      <Animated.View style={buttonAnimStyle}>
        <Pressable
          onPress={() => void togglePlayback()}
          accessibilityRole="button"
          accessibilityLabel={playing ? "Pause voice message" : "Play voice message"}
          style={[
            styles.playButton,
            {
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
            },
          ]}
        >
          <Animated.View style={[styles.iconLayer, playIconStyle]}>
            <MaterialIcons
              name="play-arrow"
              size={22}
              color={colors.onPrimary}
            />
          </Animated.View>
          <Animated.View style={[styles.iconLayer, pauseIconStyle]}>
            <MaterialIcons name="pause" size={22} color={colors.onPrimary} />
          </Animated.View>
        </Pressable>
      </Animated.View>

      <VoiceWaveform
        seed={seed}
        progress={progress}
        onSeek={seekToProgress}
      />

      <Text style={[styles.duration, { color: colors.textSecondary }]}>
        {formatDuration(displayMs)}
      </Text>
    </View>
  );

  return (
    <View style={[styles.shell, { borderColor: shellBorder }]}>
      {Platform.OS === "web" ? (
        <View
          style={[
            styles.webGlass,
            { backgroundColor: colors.surfaceElevated },
          ]}
        >
          {glass}
        </View>
      ) : (
        <BlurView
          intensity={mode === "dark" ? 48 : 56}
          tint={blurTint}
          style={[
            styles.blur,
            { backgroundColor: `${colors.surfaceElevated}B3` },
          ]}
        >
          {glass}
        </BlurView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    minWidth: 228,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
  },
  blur: {
    borderRadius: 18,
    overflow: "hidden",
  },
  webGlass: {
    borderRadius: 18,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  iconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  duration: {
    minWidth: 36,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    textAlign: "right",
  },
});
