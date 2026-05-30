/**
 * Resolves a color from the active palette (light/dark + user-selected theme).
 */

import type { ThemeColorName } from "@/constants/theme";
import { useThemePalette } from "@/providers/theme-palette-provider";

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: ThemeColorName,
) {
  const { mode, legacyColors } = useThemePalette();
  const colorFromProps = props[mode];

  if (colorFromProps) {
    return colorFromProps;
  }

  return legacyColors[colorName];
}
