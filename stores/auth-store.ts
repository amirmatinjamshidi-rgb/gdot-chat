import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type LoginMethod = "phone" | "email";

export type AuthUser = {
  id: string;
  method: LoginMethod;
  identifier: string;
};

type AuthState = {
  user: AuthUser | null;
  isReady: boolean;
  isAuthenticated: boolean;
};

type AuthActions = {
  signIn: (method: LoginMethod, identifier: string) => Promise<void>;
  signOut: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  setReady: (ready: boolean) => void;
};

type AuthStore = AuthState & AuthActions;

const AUTH_KEY = "smash_auth_v1";
const HAS_GET_ITEM_ASYNC = typeof SecureStore.getItemAsync === "function";
const HAS_SET_ITEM_ASYNC = typeof SecureStore.setItemAsync === "function";
const HAS_DELETE_ITEM_ASYNC = typeof SecureStore.deleteItemAsync === "function";
let secureStoreDisabledForSession = false;

const SKIP_SECURE_STORE = Platform.OS === "web";

function shouldDisableSecureStore(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /setValueWithKeyAsync|getValueWithKeyAsync|deleteValueWithKeyAsync/.test(
      msg,
    ) && /not a function/.test(msg)
  );
}

async function readFromFallback(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(AUTH_KEY);
  } catch {
    return null;
  }
}

async function writeToFallback(json: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(AUTH_KEY, json);
    return true;
  } catch {
    return false;
  }
}

async function clearFallback(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUTH_KEY);
  } catch {
    /* noop */
  }
}

async function loadAuthJson(): Promise<string | null> {
  if (SKIP_SECURE_STORE) {
    return readFromFallback();
  }
  if (HAS_GET_ITEM_ASYNC && !secureStoreDisabledForSession) {
    try {
      const raw = await SecureStore.getItemAsync(AUTH_KEY);
      if (raw) return raw;
    } catch (error) {
      if (shouldDisableSecureStore(error)) {
        secureStoreDisabledForSession = true;
      }
    }
  }
  return readFromFallback();
}

async function saveAuthJson(json: string): Promise<void> {
  if (SKIP_SECURE_STORE) {
    await writeToFallback(json);
    return;
  }
  if (HAS_SET_ITEM_ASYNC && !secureStoreDisabledForSession) {
    try {
      await SecureStore.setItemAsync(AUTH_KEY, json);
      return;
    } catch (error) {
      if (shouldDisableSecureStore(error)) {
        secureStoreDisabledForSession = true;
      }
    }
  }
  await writeToFallback(json);
}

async function removeAuthEverywhere(): Promise<void> {
  await clearFallback();
  if (SKIP_SECURE_STORE) {
    return;
  }
  if (HAS_DELETE_ITEM_ASYNC && !secureStoreDisabledForSession) {
    try {
      await SecureStore.deleteItemAsync(AUTH_KEY);
    } catch (error) {
      if (shouldDisableSecureStore(error)) {
        secureStoreDisabledForSession = true;
      }
    }
  }
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isReady: false,
      isAuthenticated: false,

      initializeAuth: async () => {
        try {
          const raw = await loadAuthJson();
          if (!raw) {
            set({ isReady: true });
            return;
          }
          const parsed = JSON.parse(raw) as AuthUser;
          if (parsed?.id && parsed?.identifier && parsed?.method) {
            set({
              user: parsed,
              isAuthenticated: true,
              isReady: true,
            });
          } else {
            set({ isReady: true });
          }
        } catch {
          set({ isReady: true });
        }
      },

      signIn: async (method: LoginMethod, identifier: string) => {
        const nextUser: AuthUser = {
          id: `${method}:${identifier}`,
          method,
          identifier,
        };
        await saveAuthJson(JSON.stringify(nextUser));
        set({
          user: nextUser,
          isAuthenticated: true,
        });
      },

      signOut: async () => {
        await removeAuthEverywhere();
        set({
          user: null,
          isAuthenticated: false,
        });
      },

      setReady: (ready: boolean) => {
        set({ isReady: ready });
      },
    }),
    {
      name: AUTH_KEY,
      storage: createJSONStorage(() => ({
        getItem: async (key) => {
          const value = await loadAuthJson();
          return value;
        },
        setItem: async (key, value) => {
          await saveAuthJson(value);
        },
        removeItem: async (key) => {
          await removeAuthEverywhere();
        },
      })),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
