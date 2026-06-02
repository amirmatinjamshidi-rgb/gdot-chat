import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View } from "react-native";

import { useThemeStore } from "@/stores/theme-store";

const ACCENT_HEIGHT = 112;

/**
 * Solid screen base with a short top gradient band (accent, not full wallpaper).
 */
export function ScreenTopAccent() {
  const colors = useThemeStore((state) => state.colors);
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
    >
      <LinearGradient
        colors={[colors.backgroundSecondary, colors.background]}
        locations={[0, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.band}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: ACCENT_HEIGHT,
  },
});
