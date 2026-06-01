import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { IconSymbol } from "@/components/ui/icon-symbol";

export type CrossfadeIconKey = "send" | "mic" | "video";

type DualIconCrossfadeProps = {
  active: CrossfadeIconKey;
  size?: number;
  color: string;
};

const INDEX: Record<CrossfadeIconKey, number> = {
  send: 0,
  mic: 1,
  video: 2,
};

/**
 * Stacked SF / Material icons with a short scale+opacity crossfade when
 * `active` changes (one shrinks while the next grows).
 */
export function DualIconCrossfade({
  active,
  size = 22,
  color,
}: DualIconCrossfadeProps) {
  const focus = useSharedValue(INDEX[active]);

  useEffect(() => {
    focus.value = withTiming(INDEX[active], {
      duration: 200,
      easing: Easing.out(Easing.circle),
    });
  }, [active, focus]);

  const sendStyle = useAnimatedStyle(() => {
    const d = Math.abs(focus.value);
    const scale = 0.74 + 0.26 * Math.max(0, 1 - d * 1.05);
    const opacity = 0.18 + 0.82 * Math.max(0, 1 - d * 1.12);
    return { transform: [{ scale }], opacity };
  });

  const micStyle = useAnimatedStyle(() => {
    const d = Math.abs(focus.value - 1);
    const scale = 0.74 + 0.26 * Math.max(0, 1 - d * 1.55);
    const opacity = 0.18 + 0.82 * Math.max(0, 1 - d * 1.52);
    return { transform: [{ scale }], opacity };
  });

  const videoStyle = useAnimatedStyle(() => {
    const d = Math.abs(focus.value - 2);
    const scale = 0.74 + 0.26 * Math.max(0, 1 - d * 1.55);
    const opacity = 0.18 + 0.82 * Math.max(0, 1 - d * 1.52);
    return { transform: [{ scale }], opacity };
  });

  return (
    <View style={[styles.box, { width: size + 6, height: size + 6 }]}>
      <Animated.View style={[styles.layer, sendStyle]}>
        <IconSymbol name="paperplane.fill" size={size} color={color} />
      </Animated.View>
      <Animated.View style={[styles.layer, micStyle]}>
        <IconSymbol name="mic.fill" size={size} color={color} />
      </Animated.View>
      <Animated.View style={[styles.layer, videoStyle]}>
        <IconSymbol name="video.fill" size={size} color={color} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
