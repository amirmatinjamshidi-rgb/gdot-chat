import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  Canvas,
  Group,
  Mask,
  Rect,
  RoundedRect,
} from "@shopify/react-native-skia";
import {
  runOnJS,
  useDerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import {
  BAR_GAP,
  BAR_WIDTH,
  MAX_BAR_HEIGHT,
  VOICE_WAVEFORM_TOTAL_WIDTH,
  buildWaveform,
} from "@/components/voice-waveform";

type VoiceWaveformSkiaProps = {
  seed: string;
  progressSV: SharedValue<number>;
  playedColor: string;
  unplayedColor: string;
  onSeek?: (progress: number) => void;
};

type BarLayout = { x: number; y: number; h: number };

function computeBarLayouts(heights: number[]): BarLayout[] {
  const out: BarLayout[] = [];
  let x = 0;
  for (let i = 0; i < heights.length; i += 1) {
    const bh = heights[i] * MAX_BAR_HEIGHT;
    out.push({ x, y: (MAX_BAR_HEIGHT - bh) / 2, h: bh });
    x += BAR_WIDTH + BAR_GAP;
  }
  return out;
}

/**
 * Native: Skia draws bars + mask; progress updates only `SharedValue` → GPU
 * redraw without re-rendering dozens of `View` nodes.
 */
export function VoiceWaveformSkia({
  seed,
  progressSV,
  playedColor,
  unplayedColor,
  onSeek,
}: VoiceWaveformSkiaProps) {
  const heights = useMemo(() => buildWaveform(seed), [seed]);
  const layouts = useMemo(() => computeBarLayouts(heights), [heights]);

  const maskWidth = useDerivedValue(() => {
    const w = progressSV.value * VOICE_WAVEFORM_TOTAL_WIDTH;
    return Math.max(0, Math.min(VOICE_WAVEFORM_TOTAL_WIDTH, w));
  });

  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        if (!onSeek) return;
        const x = e.x;
        const p = Math.min(
          1,
          Math.max(0, x / VOICE_WAVEFORM_TOTAL_WIDTH),
        );
        runOnJS(onSeek)(p);
      }),
    [onSeek],
  );

  return (
    <GestureDetector gesture={tap}>
      <View style={styles.wrap} collapsable={false}>
        <Canvas style={styles.canvas}>
          <Group>
            {layouts.map((layout, i) => (
              <RoundedRect
                key={`u-${i}`}
                x={layout.x}
                y={layout.y}
                width={BAR_WIDTH}
                height={layout.h}
                r={BAR_WIDTH / 2}
                color={unplayedColor}
              />
            ))}
          </Group>
          <Mask
            mask={
              <Rect
                x={0}
                y={0}
                width={maskWidth}
                height={MAX_BAR_HEIGHT}
                color="white"
              />
            }
          >
            <Group>
              {layouts.map((layout, i) => (
                <RoundedRect
                  key={`p-${i}`}
                  x={layout.x}
                  y={layout.y}
                  width={BAR_WIDTH}
                  height={layout.h}
                  r={BAR_WIDTH / 2}
                  color={playedColor}
                />
              ))}
            </Group>
          </Mask>
        </Canvas>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: MAX_BAR_HEIGHT,
    flex: 1,
    minWidth: VOICE_WAVEFORM_TOTAL_WIDTH,
  },
  canvas: {
    width: VOICE_WAVEFORM_TOTAL_WIDTH,
    height: MAX_BAR_HEIGHT,
    alignSelf: "center",
  },
});
