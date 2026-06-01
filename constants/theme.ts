/**
 * Smash design tokens — multi-palette themes (light/dark) + navigation bridge.
 * Social / chat direction informed by UI/UX Pro Max design-system run (vibrant, high contrast).
 */

import { DarkTheme, DefaultTheme, type Theme } from "@react-navigation/native";
import { Platform } from "react-native";

/** Keys consumed by `useThemeColor` and classic themed components */
export type ThemeColorName =
  | "text"
  | "background"
  | "tint"
  | "icon"
  | "tabIconDefault"
  | "tabIconSelected";

export type ThemeId =
  | "smashPulse"
  | "aurora"
  | "midnightGold"
  | "emberGlow"
  | "cyberTeal"
  | "cosmicViolet";

export type AppColorScheme = {
  text: string;
  textSecondary: string;
  textMuted: string;
  background: string;
  backgroundSecondary: string;
  surface: string;
  surfaceElevated: string;
  surfaceBorder: string;
  tint: string;
  tintMuted: string;
  primary: string;
  onPrimary: string;
  link: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  success: string;
  error: string;
  /** Hero / screen gradients */
  gradientStart: string;
  gradientMid: string;
  gradientEnd: string;
  /** Search / glass highlights */
  accentGlow: string;
  /** OTP / inputs */
  inputBorder: string;
  inputBorderFocus: string;
  inputFill: string;
};

export type ThemeDefinition = {
  id: ThemeId;
  label: string;
  tagline: string;
  light: AppColorScheme;
  dark: AppColorScheme;
};

function navTheme(
  mode: "light" | "dark",
  c: AppColorScheme,
): Theme {
  const base = mode === "dark" ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.tint,
      background: c.background,
      card: c.surface,
      text: c.text,
      border: c.surfaceBorder,
      notification: c.primary,
    },
  };
}

export function buildNavigationTheme(
  mode: "light" | "dark",
  c: AppColorScheme,
): Theme {
  return navTheme(mode, c);
}

/** Maps extended palette → legacy `Colors` shape for hooks */
export function toLegacyColors(c: AppColorScheme) {
  return {
    text: c.text,
    background: c.background,
    tint: c.tint,
    icon: c.icon,
    tabIconDefault: c.tabIconDefault,
    tabIconSelected: c.tabIconSelected,
  };
}

export const APP_THEMES: ThemeDefinition[] = [
  {
    id: "smashPulse",
    label: "Smash Pulse",
    tagline: "Rose energy · electric blue links",
    light: {
      text: "#881337",
      textSecondary: "#9F1239",
      textMuted: "#64748B",
      background: "#FFF1F2",
      backgroundSecondary: "#FFE4E6",
      surface: "rgba(255,255,255,0.92)",
      surfaceElevated: "#FFFFFF",
      surfaceBorder: "#FECDD3",
      tint: "#2563EB",
      tintMuted: "#93C5FD",
      primary: "#E11D48",
      onPrimary: "#FFFFFF",
      link: "#2563EB",
      icon: "#BE123C",
      tabIconDefault: "#9CA3AF",
      tabIconSelected: "#E11D48",
      success: "#059669",
      error: "#DC2626",
      gradientStart: "#FFE4E6",
      gradientMid: "#FDE68A",
      gradientEnd: "#BFDBFE",
      accentGlow: "#38BDF8",
      inputBorder: "#FDA4AF",
      inputBorderFocus: "#2563EB",
      inputFill: "rgba(255,255,255,0.55)",
    },
    dark: {
      text: "#FDF2F8",
      textSecondary: "#FBCFE8",
      textMuted: "#94A3B8",
      background: "#0C0410",
      backgroundSecondary: "#1A0A14",
      surface: "rgba(24,10,22,0.88)",
      surfaceElevated: "#1F0F1A",
      surfaceBorder: "rgba(251,113,133,0.35)",
      tint: "#60A5FA",
      tintMuted: "#3B82F6",
      primary: "#FB7185",
      onPrimary: "#1F0F1A",
      link: "#93C5FD",
      icon: "#FDA4AF",
      tabIconDefault: "#64748B",
      tabIconSelected: "#FB7185",
      success: "#34D399",
      error: "#F87171",
      gradientStart: "#1A0A2E",
      gradientMid: "#4C1D40",
      gradientEnd: "#0F172A",
      accentGlow: "#22D3EE",
      inputBorder: "#475569",
      inputBorderFocus: "#60A5FA",
      inputFill: "rgba(15,23,42,0.55)",
    },
  },
  {
    id: "aurora",
    label: "Aurora Indigo",
    tagline: "Micro-SaaS calm · indigo depth",
    light: {
      text: "#1E1B4B",
      textSecondary: "#312E81",
      textMuted: "#64748B",
      background: "#F5F3FF",
      backgroundSecondary: "#EDE9FE",
      surface: "rgba(255,255,255,0.94)",
      surfaceElevated: "#FFFFFF",
      surfaceBorder: "#DDD6FE",
      tint: "#6366F1",
      tintMuted: "#A5B4FC",
      primary: "#4F46E5",
      onPrimary: "#FFFFFF",
      link: "#6366F1",
      icon: "#4338CA",
      tabIconDefault: "#94A3B8",
      tabIconSelected: "#6366F1",
      success: "#10B981",
      error: "#EF4444",
      gradientStart: "#EEF2FF",
      gradientMid: "#C7D2FE",
      gradientEnd: "#DDD6FE",
      accentGlow: "#818CF8",
      inputBorder: "#C4B5FD",
      inputBorderFocus: "#6366F1",
      inputFill: "rgba(255,255,255,0.6)",
    },
    dark: {
      text: "#EEF2FF",
      textSecondary: "#C7D2FE",
      textMuted: "#94A3B8",
      background: "#0B0F1F",
      backgroundSecondary: "#111827",
      surface: "rgba(17,24,39,0.9)",
      surfaceElevated: "#1E293B",
      surfaceBorder: "#334155",
      tint: "#A5B4FC",
      tintMuted: "#818CF8",
      primary: "#818CF8",
      onPrimary: "#0F172A",
      link: "#A5B4FC",
      icon: "#C7D2FE",
      tabIconDefault: "#64748B",
      tabIconSelected: "#A5B4FC",
      success: "#34D399",
      error: "#F87171",
      gradientStart: "#0F172A",
      gradientMid: "#1E1B4B",
      gradientEnd: "#312E81",
      accentGlow: "#38BDF8",
      inputBorder: "#475569",
      inputBorderFocus: "#818CF8",
      inputFill: "rgba(15,23,42,0.55)",
    },
  },
  {
    id: "midnightGold",
    label: "Midnight Gold",
    tagline: "Luxury contrast · warm metal",
    light: {
      text: "#0C0A09",
      textSecondary: "#292524",
      textMuted: "#57534E",
      background: "#FAFAF9",
      backgroundSecondary: "#F5F5F4",
      surface: "rgba(255,255,255,0.95)",
      surfaceElevated: "#FFFFFF",
      surfaceBorder: "#D6D3D1",
      tint: "#CA8A04",
      tintMuted: "#EAB308",
      primary: "#1C1917",
      onPrimary: "#FAFAF9",
      link: "#B45309",
      icon: "#44403C",
      tabIconDefault: "#A8A29E",
      tabIconSelected: "#CA8A04",
      success: "#15803D",
      error: "#B91C1C",
      gradientStart: "#FAFAF9",
      gradientMid: "#FEF3C7",
      gradientEnd: "#E7E5E4",
      accentGlow: "#FBBF24",
      inputBorder: "#D6D3D1",
      inputBorderFocus: "#CA8A04",
      inputFill: "rgba(255,255,255,0.65)",
    },
    dark: {
      text: "#FAFAF9",
      textSecondary: "#E7E5E4",
      textMuted: "#A8A29E",
      background: "#0C0A09",
      backgroundSecondary: "#1C1917",
      surface: "rgba(28,25,23,0.92)",
      surfaceElevated: "#1C1917",
      surfaceBorder: "#44403C",
      tint: "#FBBF24",
      tintMuted: "#D97706",
      primary: "#FBBF24",
      onPrimary: "#0C0A09",
      link: "#FCD34D",
      icon: "#D6D3D1",
      tabIconDefault: "#78716C",
      tabIconSelected: "#FBBF24",
      success: "#4ADE80",
      error: "#FCA5A5",
      gradientStart: "#0C0A09",
      gradientMid: "#292524",
      gradientEnd: "#451A03",
      accentGlow: "#FBBF24",
      inputBorder: "#57534E",
      inputBorderFocus: "#FBBF24",
      inputFill: "rgba(12,10,9,0.55)",
    },
  },
  {
    id: "emberGlow",
    label: "Ember Glow",
    tagline: "Sunset heat · citrus motion",
    light: {
      text: "#451A03",
      textSecondary: "#78350F",
      textMuted: "#78716C",
      background: "#FFF7ED",
      backgroundSecondary: "#FFEDD5",
      surface: "rgba(255,255,255,0.93)",
      surfaceElevated: "#FFFFFF",
      surfaceBorder: "#FDBA74",
      tint: "#EA580C",
      tintMuted: "#FB923C",
      primary: "#F97316",
      onPrimary: "#FFFFFF",
      link: "#EA580C",
      icon: "#C2410C",
      tabIconDefault: "#A8A29E",
      tabIconSelected: "#F97316",
      success: "#059669",
      error: "#DC2626",
      gradientStart: "#FFF7ED",
      gradientMid: "#FED7AA",
      gradientEnd: "#FECACA",
      accentGlow: "#FB7185",
      inputBorder: "#FDBA74",
      inputBorderFocus: "#F97316",
      inputFill: "rgba(255,255,255,0.58)",
    },
    dark: {
      text: "#FFFBEB",
      textSecondary: "#FDE68A",
      textMuted: "#A8A29E",
      background: "#1C1410",
      backgroundSecondary: "#292524",
      surface: "rgba(41,37,36,0.9)",
      surfaceElevated: "#292524",
      surfaceBorder: "#EA580C",
      tint: "#FB923C",
      tintMuted: "#FDBA74",
      primary: "#FB923C",
      onPrimary: "#1C1410",
      link: "#FDBA74",
      icon: "#FED7AA",
      tabIconDefault: "#78716C",
      tabIconSelected: "#FB923C",
      success: "#34D399",
      error: "#F87171",
      gradientStart: "#1C1410",
      gradientMid: "#7C2D12",
      gradientEnd: "#0F172A",
      accentGlow: "#F97316",
      inputBorder: "#57534E",
      inputBorderFocus: "#FB923C",
      inputFill: "rgba(12,10,9,0.5)",
    },
  },
  {
    id: "cyberTeal",
    label: "Cyber Teal",
    tagline: "Productivity focus · glass depth",
    light: {
      text: "#134E4A",
      textSecondary: "#115E59",
      textMuted: "#64748B",
      background: "#F0FDFA",
      backgroundSecondary: "#CCFBF1",
      surface: "rgba(255,255,255,0.94)",
      surfaceElevated: "#FFFFFF",
      surfaceBorder: "#99F6E4",
      tint: "#0D9488",
      tintMuted: "#2DD4BF",
      primary: "#0F766E",
      onPrimary: "#FFFFFF",
      link: "#0D9488",
      icon: "#0F766E",
      tabIconDefault: "#94A3B8",
      tabIconSelected: "#0D9488",
      success: "#059669",
      error: "#DC2626",
      gradientStart: "#ECFEFF",
      gradientMid: "#CCFBF1",
      gradientEnd: "#A5F3FC",
      accentGlow: "#22D3EE",
      inputBorder: "#5EEAD4",
      inputBorderFocus: "#0D9488",
      inputFill: "rgba(255,255,255,0.6)",
    },
    dark: {
      text: "#F0FDFA",
      textSecondary: "#99F6E4",
      textMuted: "#94A3B8",
      background: "#042F2E",
      backgroundSecondary: "#0F172A",
      surface: "rgba(15,23,42,0.88)",
      surfaceElevated: "#134E4A",
      surfaceBorder: "#0F766E",
      tint: "#2DD4BF",
      tintMuted: "#14B8A6",
      primary: "#14B8A6",
      onPrimary: "#042F2E",
      link: "#5EEAD4",
      icon: "#99F6E4",
      tabIconDefault: "#64748B",
      tabIconSelected: "#2DD4BF",
      success: "#34D399",
      error: "#F87171",
      gradientStart: "#042F2E",
      gradientMid: "#0F766E",
      gradientEnd: "#0F172A",
      accentGlow: "#22D3EE",
      inputBorder: "#475569",
      inputBorderFocus: "#2DD4BF",
      inputFill: "rgba(15,23,42,0.55)",
    },
  },
  {
    id: "cosmicViolet",
    label: "Cosmic Violet",
    tagline: "AI-night · cyan sparks",
    light: {
      text: "#1E1B4B",
      textSecondary: "#4C1D95",
      textMuted: "#64748B",
      background: "#FAF5FF",
      backgroundSecondary: "#F3E8FF",
      surface: "rgba(255,255,255,0.93)",
      surfaceElevated: "#FFFFFF",
      surfaceBorder: "#DDD6FE",
      tint: "#7C3AED",
      tintMuted: "#A78BFA",
      primary: "#6D28D9",
      onPrimary: "#FFFFFF",
      link: "#2563EB",
      icon: "#5B21B6",
      tabIconDefault: "#94A3B8",
      tabIconSelected: "#7C3AED",
      success: "#059669",
      error: "#DC2626",
      gradientStart: "#FAF5FF",
      gradientMid: "#E0E7FF",
      gradientEnd: "#CFFAFE",
      accentGlow: "#06B6D4",
      inputBorder: "#C4B5FD",
      inputBorderFocus: "#7C3AED",
      inputFill: "rgba(255,255,255,0.58)",
    },
    dark: {
      text: "#EDE9FE",
      textSecondary: "#DDD6FE",
      textMuted: "#94A3B8",
      background: "#0B0518",
      backgroundSecondary: "#1E1033",
      surface: "rgba(30,16,51,0.9)",
      surfaceElevated: "#2E1067",
      surfaceBorder: "rgba(167,139,250,0.4)",
      tint: "#A78BFA",
      tintMuted: "#8B5CF6",
      primary: "#C4B5FD",
      onPrimary: "#1E1033",
      link: "#22D3EE",
      icon: "#DDD6FE",
      tabIconDefault: "#64748B",
      tabIconSelected: "#A78BFA",
      success: "#34D399",
      error: "#F87171",
      gradientStart: "#0B0518",
      gradientMid: "#4C1D95",
      gradientEnd: "#042F2E",
      accentGlow: "#22D3EE",
      inputBorder: "#475569",
      inputBorderFocus: "#A78BFA",
      inputFill: "rgba(15,23,42,0.5)",
    },
  },
];

export const DEFAULT_THEME_ID: ThemeId = "smashPulse";

export function getThemeDefinition(id: ThemeId): ThemeDefinition {
  return APP_THEMES.find((t) => t.id === id) ?? APP_THEMES[0];
}

export function resolveThemeColors(
  id: ThemeId,
  mode: "light" | "dark",
): AppColorScheme {
  const def = getThemeDefinition(id);
  return mode === "dark" ? def.dark : def.light;
}

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
