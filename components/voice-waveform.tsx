import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

const BAR_COUNT = 44;
const BAR_WIDTH = 2.5;
const BAR_GAP = 2;
const MAX_BAR_HEIGHT = 26;

function hashSeed(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return hash;
}

export function buildWaveform(seed: string, count = BAR_COUNT) {
  let hash = hashSeed(seed);
  const bars: number[] = [];
  for (let i = 0; i < count; i += 1) {
    hash = (hash * 1103515245 + 12345 + i) | 0;
    const n = (Math.abs(hash) % 1000) / 1000;
    bars.push(0.22 + n * 0.78);
  }
  return bars;
}

type VoiceWaveformProps = {
  seed: string;
  progress: number;
  onSeek?: (progress: number) => void;
};

export function VoiceWaveform({ seed, progress, onSeek }: VoiceWaveformProps) {
  const bars = useMemo(() => buildWaveform(seed), [seed]);
  const clamped = Math.min(1, Math.max(0, progress));
  const playedBars = clamped * bars.length;

  const onPress = (event: {
    nativeEvent: { locationX: number };
  }) => {
    if (!onSeek) return;
    const width = BAR_COUNT * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
    const next = Math.min(1, Math.max(0, event.nativeEvent.locationX / width));
    onSeek(next);
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="adjustable"
      accessibilityLabel="Voice message progress"
      style={styles.wrap}
    >
      {bars.map((height, index) => {
        const barHeight = height * MAX_BAR_HEIGHT;
        const isPlayed = index < playedBars;
        return (
          <View
            key={index}
            style={[
              styles.bar,
              {
                height: barHeight,
                backgroundColor: isPlayed
                  ? "rgba(203,213,225,0.95)"
                  : "rgba(100,116,139,0.55)",
              },
            ]}
          />
        );
      })}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    height: MAX_BAR_HEIGHT,
    gap: BAR_GAP,
    flex: 1,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH,
  },
});
