import React from "react";
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const SPRING = { damping: 16, stiffness: 320 };

type ScalePressableProps = Omit<PressableProps, "style"> & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Subtle scale feedback on press-in/out. Layout styles (width, flex, padding, …)
 * stay on the Pressable so grids and rows measure correctly.
 */
export function ScalePressable({
  children,
  style,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: ScalePressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      style={style}
      onPressIn={(e) => {
        if (!disabled) {
          scale.value = withSpring(0.96, SPRING);
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!disabled) {
          scale.value = withSpring(1, SPRING);
        }
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[{ width: "100%" }, animatedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
