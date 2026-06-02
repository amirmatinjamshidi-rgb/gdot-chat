import type { MaterialTopTabBarProps } from "@react-navigation/material-top-tabs";
import * as Haptics from "expo-haptics";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useThemeStore, useColors, useLegacyColors } from "@/stores/theme-store";

const ICONS = [
  "house.fill",
  "bubble.left.and.bubble.right.fill",
  "person.crop.circle.fill",
] as const;

export function SwipeTabBar({ state, descriptors, navigation }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const legacyColors = useLegacyColors();
  const bottomPad = Math.max(insets.bottom, Platform.OS === "ios" ? 20 : 14);
  const barHeight = Platform.OS === "ios" ? 104 + bottomPad * 0.12 : 84;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surfaceElevated,
          borderTopColor: colors.surfaceBorder,
          paddingBottom: bottomPad,
          minHeight: barHeight,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const opts = descriptors[route.key].options;
        const label =
          typeof opts.tabBarLabel === "string"
            ? opts.tabBarLabel
            : opts.title ?? route.name;
        const color = focused
          ? legacyColors.tabIconSelected
          : legacyColors.tabIconDefault;

        const iconName = ICONS[Math.min(index, ICONS.length - 1)]!;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
            onPressIn={(ev) => {
              if (process.env.EXPO_OS === "ios") {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
            }}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}
          >
            <IconSymbol name={iconName} size={26} color={color} />
            <Text style={[styles.label, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 4,
  },
  tabPressed: {
    opacity: 0.72,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.25,
  },
});
