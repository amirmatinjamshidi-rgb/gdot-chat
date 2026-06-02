import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import type { AppColorScheme } from "@/constants/theme";

type LoginAmbientBackgroundProps = {
  colors: Pick<
    AppColorScheme,
    | "background"
    | "backgroundSecondary"
    | "gradientStart"
    | "gradientMid"
    | "gradientEnd"
    | "primary"
    | "tint"
    | "accentGlow"
  >;
};

const ORB_LARGE = 268;
const ORB_HUE_MS = 940;
const ORB_DELAY_MS = Platform.OS === "web" ? 40 : 120;

/**
 * Full-screen login mesh: soft gradient + glassy orbs that ease from center
 * toward the sides (ambient depth; keeps focus on the form).
 */
export function LoginAmbientBackground({ colors }: LoginAmbientBackgroundProps) {
  const { width, height } = useWindowDimensions();
  const spread = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (!cancelled) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      cancelled = true;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      spread.value = 1;
      return;
    }
    spread.value = 0;
    spread.value = withDelay(
      ORB_DELAY_MS,
      withTiming(1, {
        duration: ORB_HUE_MS,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [reduceMotion, spread]);

  const driftX = Math.min(width * 0.22, 136);
  const driftY = Math.min(height * 0.045, 32);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          spread.value,
          [0, 1],
          [0.62, 1.08],
          Extrapolation.CLAMP,
        ),
      },
    ],
    opacity: interpolate(spread.value, [0, 1], [0.28, 0.68], Extrapolation.CLAMP),
  }));

  const leftOrbStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          spread.value,
          [0, 1],
          [0, -driftX],
          Extrapolation.CLAMP,
        ),
      },
      {
        translateY: interpolate(
          spread.value,
          [0, 1],
          [driftY * 0.55, -driftY * 0.2],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(
          spread.value,
          [0, 1],
          [0.84, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
    opacity: interpolate(
      spread.value,
      [0, 0.32, 1],
      [0.52, 0.82, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const rightOrbStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          spread.value,
          [0, 1],
          [0, driftX],
          Extrapolation.CLAMP,
        ),
      },
      {
        translateY: interpolate(
          spread.value,
          [0, 1],
          [driftY * 0.7, driftY * 0.12],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(
          spread.value,
          [0, 1],
          [0.8, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
    opacity: interpolate(
      spread.value,
      [0, 0.32, 1],
      [0.48, 0.78, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const primarySoft = `${colors.primary}3A`;
  const tintSoft = `${colors.tint}42`;
  const glowSoft = `${colors.accentGlow}50`;

  const rightSize = ORB_LARGE * 0.9;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[
          colors.gradientStart,
          colors.backgroundSecondary,
          colors.background,
          colors.gradientMid,
          colors.gradientEnd,
        ]}
        locations={[0, 0.22, 0.48, 0.78, 1]}
        start={{ x: 0.06, y: 0 }}
        end={{ x: 0.94, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.layer} importantForAccessibility="no">
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.centerSheet, haloStyle]}
        >
          <View
            style={[
              styles.halo,
              {
                width: ORB_LARGE * 0.72,
                height: ORB_LARGE * 0.72,
                borderRadius: (ORB_LARGE * 0.72) / 2,
                backgroundColor: glowSoft,
              },
            ]}
          />
        </Animated.View>

        <Animated.View
          style={[StyleSheet.absoluteFill, styles.centerSheet, leftOrbStyle]}
        >
          <View
            style={[
              styles.orb,
              {
                width: ORB_LARGE,
                height: ORB_LARGE,
                borderRadius: ORB_LARGE / 2,
                backgroundColor: primarySoft,
                borderColor: `${colors.primary}26`,
              },
            ]}
          />
        </Animated.View>

        <Animated.View
          style={[StyleSheet.absoluteFill, styles.centerSheet, rightOrbStyle]}
        >
          <View
            style={[
              styles.orb,
              {
                width: rightSize,
                height: rightSize,
                borderRadius: rightSize / 2,
                backgroundColor: tintSoft,
                borderColor: `${colors.tint}2A`,
              },
            ]}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
  centerSheet: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: "14%",
  },
  halo: {},
  orb: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
