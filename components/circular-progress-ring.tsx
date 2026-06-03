import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

type CircularProgressRingProps = {
  size: number;
  stroke?: number;
  progress: number;
  trackColor?: string;
  fillColor?: string;
};

export function CircularProgressRing({
  size,
  stroke = 4,
  progress,
  trackColor = "rgba(144, 10, 144, 0.35)",
  fillColor = "#5cf9e8",
}: CircularProgressRingProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - clamped);

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      pointerEvents="none"
    >
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={stroke}
          fill="none"
        />
        {clamped > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={fillColor}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
          />
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
  },
});
