import React, { useState } from "react";
import {
  runOnJS,
  useAnimatedReaction,
  type SharedValue,
} from "react-native-reanimated";

import { VoiceWaveform } from "@/components/voice-waveform";

type VoiceWaveformSkiaProps = {
  seed: string;
  progressSV: SharedValue<number>;
  playedColor: string;
  unplayedColor: string;
  onSeek?: (progress: number) => void;
};

/**
 * Web: same look as native; progress is driven from the shared value without
 * wiring Skia into the web bundle.
 */
export function VoiceWaveformSkia({
  seed,
  progressSV,
  onSeek,
}: VoiceWaveformSkiaProps) {
  const [progress, setProgress] = useState(() => progressSV.value);

  useAnimatedReaction(
    () => progressSV.value,
    (v) => {
      runOnJS(setProgress)(v);
    },
    [progressSV],
  );

  return <VoiceWaveform seed={seed} progress={progress} onSeek={onSeek} />;
}
