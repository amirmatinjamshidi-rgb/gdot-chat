import { SymbolView, SymbolViewProps, SymbolWeight } from "expo-symbols";
import { StyleProp, ViewStyle } from "react-native";

/**
 * SF Symbols on iOS. Prefer **medium** weight at size ≥26 (e.g. tab bar) so glyphs match
 * the visual weight of filled Material icons on Android/web at the same grid.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = size >= 26 ? "medium" : "regular",
}: {
  name: SymbolViewProps["name"];
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={name}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}
