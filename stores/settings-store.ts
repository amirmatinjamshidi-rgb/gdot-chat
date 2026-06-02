import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { settingsSections } from "@/constants/profile-data";

function defaultTogglesFromProfile(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const section of settingsSections) {
    for (const item of section.items) {
      if (item.hasToggle && typeof item.enabled === "boolean") {
        out[item.id] = item.enabled;
      }
    }
  }
  return out;
}

type SettingsState = {
  /** Toggle rows keyed by `SettingsItem.id` (e.g. notifications, fast-mode). */
  toggles: Record<string, boolean>;
};

type SettingsActions = {
  setToggle: (id: string, enabled: boolean) => void;
  getToggle: (id: string) => boolean;
  resetTogglesToDefaults: () => void;
};

type SettingsStore = SettingsState & SettingsActions;

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      toggles: defaultTogglesFromProfile(),

      setToggle: (id: string, enabled: boolean) => {
        set((state) => ({
          toggles: { ...state.toggles, [id]: enabled },
        }));
      },

      getToggle: (id: string) => {
        const v = get().toggles[id];
        if (typeof v === "boolean") return v;
        return defaultTogglesFromProfile()[id] ?? false;
      },

      resetTogglesToDefaults: () => {
        set({ toggles: defaultTogglesFromProfile() });
      },
    }),
    {
      name: "smash_settings_v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ toggles: state.toggles }),
    },
  ),
);
