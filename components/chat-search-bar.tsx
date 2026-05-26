import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

type ChatSearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  visible: boolean;
  isDark: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ChatSearchBar({
  value,
  onChangeText,
  visible,
  isDark,
  style,
}: ChatSearchBarProps) {
  const [mounted, setMounted] = useState(visible);
  const reveal = useSharedValue(visible ? 1 : 0);
  const focus = useSharedValue(0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      reveal.value = withTiming(1, { duration: 220 });
      return;
    }
    reveal.value = withTiming(0, { duration: 180 }, (finished) => {
      if (finished) {
        runOnJS(setMounted)(false);
      }
    });
  }, [reveal, visible]);

  useEffect(() => {
    return () => {
      cancelAnimation(sweep);
      cancelAnimation(focus);
    };
  }, [focus, sweep]);

  const onFocus = () => {
    focus.value = withTiming(1, { duration: 180 });
    sweep.value = 0;
    sweep.value = withTiming(1, { duration: 520 }, (finished) => {
      "worklet";
      if (finished) {
        focus.value = withTiming(0.65, { duration: 240 });
      }
    });
  };

  const onBlur = () => {
    cancelAnimation(sweep);
    focus.value = withTiming(0, { duration: 180 });
    sweep.value = withTiming(0, { duration: 120 });
  };

  const wrapAnim = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { translateY: interpolate(reveal.value, [0, 1], [-10, 0]) },
      { scale: interpolate(reveal.value, [0, 1], [0.98, 1]) },
    ],
  }));

  const borderAnim = useAnimatedStyle(() => ({
    borderColor: isDark
      ? `rgba(96,165,250,${0.28 + focus.value * 0.55})`
      : `rgba(59,130,246,${0.22 + focus.value * 0.5})`,
    shadowOpacity: 0.08 + focus.value * 0.18,
  }));

  const neonAnim = useAnimatedStyle(() => {
    const barW = 42;
    return {
      opacity: focus.value * 0.95,
      transform: [
        {
          translateX: interpolate(sweep.value, [0, 1], [-barW, 220]),
        },
      ],
    };
  });

  if (!mounted) return null;

  return (
    <Animated.View style={[styles.wrap, wrapAnim, style]}>
      <Animated.View
        style={[
          styles.shell,
          borderAnim,
          {
            backgroundColor: isDark
              ? "rgba(15,23,42,0.42)"
              : "rgba(255,255,255,0.45)",
          },
        ]}
      >
        <View style={styles.neonClip} pointerEvents="none">
          <Animated.View style={[styles.neonBar, neonAnim]} />
        </View>
        <MaterialIcons
          name="search"
          size={20}
          color={isDark ? "#94a3b8" : "#64748b"}
          style={styles.searchIcon}
        />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Search chats"
          placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
          style={[styles.input, { color: isDark ? "#f8fafc" : "#0f172a" }]}
          onFocus={onFocus}
          onBlur={onBlur}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  shell: {
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    shadowColor: "#3B82F6",
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  neonClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    overflow: "hidden",
  },
  neonBar: {
    position: "absolute",
    top: 0,
    left: 0,
    height: 2,
    width: 42,
    borderRadius: 2,
    backgroundColor: "#5cf9e8",
  },
  searchIcon: {
    marginLeft: 14,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 9,
    paddingHorizontal: 10,
    paddingRight: 14,
  },
});
