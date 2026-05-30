import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import {
  APP_THEMES,
  buildNavigationTheme,
  DEFAULT_THEME_ID,
  resolveThemeColors,
  toLegacyColors,
  type AppColorScheme,
  type ThemeId,
} from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { Theme } from "@react-navigation/native";

const STORAGE_KEY = "smash_theme_palette_v1";

type ThemePaletteContextValue = {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  colors: AppColorScheme;
  legacyColors: ReturnType<typeof toLegacyColors>;
  navigationTheme: Theme;
  mode: "light" | "dark";
  ready: boolean;
};

const ThemePaletteContext = createContext<ThemePaletteContextValue | null>(
  null,
);

export function ThemePaletteProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const mode: "light" | "dark" = systemScheme === "dark" ? "dark" : "light";
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw && APP_THEMES.some((t) => t.id === raw)) {
          setThemeIdState(raw as ThemeId);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    void AsyncStorage.setItem(STORAGE_KEY, id);
  }, []);

  const colors = useMemo(
    () => resolveThemeColors(themeId, mode),
    [themeId, mode],
  );

  const legacyColors = useMemo(() => toLegacyColors(colors), [colors]);

  const navigationTheme = useMemo(
    () => buildNavigationTheme(mode, colors),
    [mode, colors],
  );

  const value = useMemo<ThemePaletteContextValue>(
    () => ({
      themeId,
      setThemeId,
      colors,
      legacyColors,
      navigationTheme,
      mode,
      ready,
    }),
    [
      themeId,
      setThemeId,
      colors,
      legacyColors,
      navigationTheme,
      mode,
      ready,
    ],
  );

  return (
    <ThemePaletteContext.Provider value={value}>
      {children}
    </ThemePaletteContext.Provider>
  );
}

export function useThemePalette(): ThemePaletteContextValue {
  const ctx = useContext(ThemePaletteContext);
  const systemScheme = useColorScheme();
  const mode: "light" | "dark" = systemScheme === "dark" ? "dark" : "light";

  if (!ctx) {
    const colors = resolveThemeColors(DEFAULT_THEME_ID, mode);
    return {
      themeId: DEFAULT_THEME_ID,
      setThemeId: () => {},
      colors,
      legacyColors: toLegacyColors(colors),
      navigationTheme: buildNavigationTheme(mode, colors),
      mode,
      ready: true,
    };
  }
  return ctx;
}
