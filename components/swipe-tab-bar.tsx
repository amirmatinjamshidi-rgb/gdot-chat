import type { MaterialTopTabBarProps } from "@react-navigation/material-top-tabs";
import * as Haptics from "expo-haptics";
import React, { useEffect } from "react";
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors, useLegacyColors } from "@/stores/theme-store";

const SPRING = { damping: 20, stiffness: 260, mass: 0.85 };

const ICONS = [
  "person.2.fill",
  "bubble.left.and.bubble.right.fill",
  "person.crop.circle.fill",
  "gearshape.fill",
] as const;

const FLOAT_H_PAD = 18;
const FLOAT_INNER_PAD = 6;
const PILL_GAP = 8;

export function SwipeTabBar({ state, descriptors, navigation }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const legacyColors = useLegacyColors();
  const bottomPad = Math.max(insets.bottom, Platform.OS === "ios" ? 18 : 12);

  const trackWidth = useSharedValue(0);
  const activeIndex = useSharedValue(state.index);
  const tabCount = state.routes.length;

  useEffect(() => {
    activeIndex.value = withSpring(state.index, SPRING);
  }, [state.index, activeIndex]);

  const pillStyle = useAnimatedStyle(() => {
    const w = trackWidth.value;
    const n = tabCount;
    if (w <= 0 || n <= 0) {
      return { width: 0, transform: [{ translateX: 0 }] };
    }
    const inner = w - FLOAT_INNER_PAD * 2;
    const slotW = inner / n;
    const width = Math.max(40, slotW - PILL_GAP);
    const translateX =
      FLOAT_INNER_PAD + activeIndex.value * slotW + (slotW - width) / 2;
    return {
      width,
      transform: [{ translateX }],
    };
  });

  const onTrackLayout = (e: LayoutChangeEvent) => {
    trackWidth.value = e.nativeEvent.layout.width;
  };

  return (
    <View
      style={[
        styles.outer,
        {
          paddingBottom: bottomPad + 8,
          paddingHorizontal: FLOAT_H_PAD,
        },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.floatShell,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.surfaceBorder,
            shadowColor: "#000",
          },
        ]}
      >
        <View style={styles.trackClip} onLayout={onTrackLayout}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pill,
              { backgroundColor: colors.primary },
              pillStyle,
            ]}
          />
          <View style={styles.tabsRow}>
            {state.routes.map((route, index) => {
              const focused = state.index === index;
              const opts = descriptors[route.key].options;
              const label =
                typeof opts.tabBarLabel === "string"
                  ? opts.tabBarLabel
                  : opts.title ?? route.name;
              const activeColor = legacyColors.tabIconSelected;
              const inactiveColor = legacyColors.tabIconDefault;
              const color = focused ? activeColor : inactiveColor;

              const iconName = ICONS[Math.min(index, ICONS.length - 1)]!;

              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  style={styles.tab}
                  onPressIn={() => {
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
                  <TabItemContent
                    focused={focused}
                    iconName={iconName}
                    label={label}
                    color={color}
                    activeColor={activeColor}
                    inactiveColor={inactiveColor}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

function TabItemContent({
  focused,
  iconName,
  label,
  color,
  activeColor,
  inactiveColor,
}: {
  focused: boolean;
  iconName: (typeof ICONS)[number];
  label: string;
  color: string;
  activeColor: string;
  inactiveColor: string;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.06 : 1, { damping: 16, stiffness: 320 });
  }, [focused, scale]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.tabInner, anim]}>
      <IconSymbol name={iconName} size={26} color={color} />
      <Text
        style={[
          styles.label,
          { color: focused ? activeColor : inactiveColor },
        ]}
      >
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: "transparent",
  },
  floatShell: {
    borderRadius: 28,
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 14,
  },
  trackClip: {
    position: "relative",
    paddingVertical: 10,
    minHeight: 64,
  },
  pill: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 10,
    borderRadius: 20,
    opacity: 0.2,
  },
  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 1,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 4,
  },
  tabInner: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.25,
  },
});
