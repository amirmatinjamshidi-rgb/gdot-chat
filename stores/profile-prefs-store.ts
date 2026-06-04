import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ProfilePrefs = {
  displayName: string;
  bio: string;
  phoneE164: string;
  birthday: string;
};

type ProfilePrefsState = ProfilePrefs;

type ProfilePrefsActions = {
  updatePrefs: (updates: Partial<ProfilePrefs>) => void;
  resetPrefs: () => void;
};

const EMPTY: ProfilePrefs = {
  displayName: "",
  bio: "",
  phoneE164: "",
  birthday: "",
};

type ProfilePrefsStore = ProfilePrefsState & ProfilePrefsActions;

export const useProfilePrefsStore = create<ProfilePrefsStore>()(
  persist(
    (set) => ({
      ...EMPTY,

      updatePrefs: (updates) => set((state) => ({ ...state, ...updates })),

      resetPrefs: () => set({ ...EMPTY }),
    }),
    {
      name: "gdot_profile_prefs_v1",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
