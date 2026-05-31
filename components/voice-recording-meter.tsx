import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { buildWaveform } from "@/components/voice-waveform";
import { useThemePalette } from "@/providers/theme-palette-provider";

const BAR_COUNT = 34;
const BAR_WIDTH = 2.25;
const BAR_GAP = 2;
const MAX_BAR_HEIGHT = 22;

function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0
    ? `${m}:${r.toString().padStart(2, "0")}`
    : `0:${r.toString().padStart(2, "0")}`;
}

type VoiceRecordingMeterProps = {
  elapsedMs: number;
  /** Bumps on an interval while recording so bars can animate. */
  tick: number;
};

/**
 * Live-style waveform shown in the composer while a voice message is recording.
 */
export function VoiceRecordingMeter({ elapsedMs, tick }: VoiceRecordingMeterProps) {
  const { colors } = useThemePalette();
  const bars = useMemo(() => buildWaveform("voice-recording-meter", BAR_COUNT), []);
  const phase = elapsedMs / 420 + tick * 0.12;

  return (
    <View style={styles.row} accessibilityLabel="Voice recording in progress">
      <View style={styles.wave}>
        {bars.map((base, index) => {
          const wobble =
            0.42 +
            0.58 * Math.sin(phase * 1.15 + index * 0.41 + Math.sin(index) * 0.2);
          const height = Math.max(4, base * wobble * MAX_BAR_HEIGHT);
          return (
            <View
              key={index}
              style={[
                styles.bar,
                {
                  height,
                  backgroundColor: `${colors.primary}CC`,
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.timerBlock}>
        <View style={[styles.recDot, { backgroundColor: colors.error }]} />
        <Text
          style={[styles.timerText, { color: colors.text }]}
          numberOfLines={1}
        >
          {formatDuration(elapsedMs)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minHeight: 40,
    paddingLeft: 12,
    paddingRight: 10,
    gap: 10,
  },
  wave: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: MAX_BAR_HEIGHT,
    gap: BAR_GAP,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH,
  },
  timerBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  recDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  timerText: {
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
  },
});
