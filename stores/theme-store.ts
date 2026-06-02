import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Theme } from "@react-navigation/native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
  _systemMode: "light" | "dark";
};

type ThemeComputed = {
  mode: "light" | "dark";
  colors: AppColorScheme;
  legacyColors: ReturnType<typeof toLegacyColors>;
  navigationTheme: Theme;
};

type ThemeActions = {
  setThemeId: (id: ThemeId) => void;
  initializeTheme: () => Promise<void>;
  setSystemMode: (mode: "light" | "dark") => void;
};

type ThemeStore = ThemeState & ThemeComputed & ThemeActions;

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      themeId: DEFAULT_THEME_ID,
      ready: false,
      _systemMode: "dark",

      get mode() {
        return get()._systemMode;
      },

      get colors() {
        const { themeId, _systemMode } = get();
        return resolveThemeColors(themeId, _systemMode);
      },

      get legacyColors() {
        return toLegacyColors(get().colors);
      },

      get navigationTheme() {
        const { _systemMode, colors } = get();
        return buildNavigationTheme(_systemMode, colors);
      },

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
        set({ _systemMode: mode });
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
