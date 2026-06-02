import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Theme } from "@react-navigation/native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import {
  APP_THEMES,
  buildNavigationTheme,
  DEFAULT_THEME_ID,
  resolveThemeColors,
  toLegacyColors,
  type AppColorScheme,
  type ThemeId,
} from "@/constants/theme";

const STORAGE_KEY = "smash_theme_palette_v1";

type ThemeState = {
  themeId: ThemeId;
  ready: boolean;
  mode: "light" | "dark";
};

type ThemeActions = {
  setThemeId: (id: ThemeId) => void;
  initializeTheme: () => Promise<void>;
  setSystemMode: (mode: "light" | "dark") => void;
};

type ThemeStore = ThemeState & ThemeActions;

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      themeId: DEFAULT_THEME_ID,
      ready: false,
      mode: "light",

      initializeTheme: async () => {
        try {
          const raw = await AsyncStorage.getItem(STORAGE_KEY);
          if (raw && APP_THEMES.some((t) => t.id === raw)) {
            set({ themeId: raw as ThemeId, ready: true });
          } else {
            set({ ready: true });
          }
        } catch {
          set({ ready: true });
        }
      },

      setThemeId: (id: ThemeId) => {
        set({ themeId: id });
        void AsyncStorage.setItem(STORAGE_KEY, id);
      },

      setSystemMode: (mode: "light" | "dark") => {
        set({ mode });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        themeId: state.themeId,
      }),
    },
  ),
);

// Selector functions to compute derived values
export const selectColors = (state: ThemeStore): AppColorScheme => {
  return resolveThemeColors(state.themeId, state.mode);
};

export const selectLegacyColors = (state: ThemeStore) => {
  return toLegacyColors(selectColors(state));
};

export const selectNavigationTheme = (state: ThemeStore): Theme => {
  return buildNavigationTheme(state.mode, selectColors(state));
};

// Hooks with shallow comparison for object selectors (prevents infinite re-renders)
export const useColors = () => useThemeStore(useShallow(selectColors));
export const useLegacyColors = () => useThemeStore(useShallow(selectLegacyColors));
/** Prefer `useMemo(() => buildNavigationTheme(mode, colors), [mode, colors])` in UI: `Theme` has nested objects so `useShallow(selectNavigationTheme)` does not stabilize snapshots. */
export const useNavigationTheme = () => useThemeStore(useShallow(selectNavigationTheme));
