// Fallback: Material Icons on Android / web. iOS uses `icon-symbol.ios.tsx` (SF Symbols).

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<
  SymbolViewProps["name"],
  ComponentProps<typeof MaterialIcons>["name"]
>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * SF Symbol name → Material icon. Pick **filled** Material names where possible so stroke
 * weight feels closer to SF Symbols at the same grid size.
 *
 * **Size grid (dp):** 20 (inline / dense), 24 (default rows, buttons), 26–28 (tab bar).
 */
const MAPPING = {
  "bubble.left.and.bubble.right.fill": "forum",
  "house.fill": "home",
  "mic.fill": "mic",
  "paperplane.fill": "send",
  "video.fill": "videocam",
  "person.2.fill": "contacts",
  "person.3.fill": "groups",
  "person.badge.plus": "person-add",
  "person.crop.circle.fill": "account-circle",
  "gearshape.fill": "settings",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  /** Safe fallback when route index exceeds the tab icon list */
  "circle.fill": "lens",
} as IconMapping;

/**
 * SF Symbols on iOS (`icon-symbol.ios.tsx`); mapped Material Icons here. New `name` values
 * must exist in `MAPPING`. `weight` applies on iOS only.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight: _weight,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />
  );
}
