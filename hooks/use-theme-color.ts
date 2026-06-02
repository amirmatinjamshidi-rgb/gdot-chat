/**
 * Resolves a color from the active palette (light/dark + user-selected theme).
 */

import type { ThemeColorName } from "@/constants/theme";
import { useThemeStore, useLegacyColors } from "@/stores/theme-store";

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: ThemeColorName,
) {
  const mode = useThemeStore((state) => state.mode);
  const legacyColors = useLegacyColors();
  const colorFromProps = props[mode];

  if (colorFromProps) {
    return colorFromProps;
  }

  return legacyColors[colorName];
}
