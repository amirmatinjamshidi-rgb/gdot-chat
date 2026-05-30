import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

type LoginMethod = "phone" | "email";

type AuthUser = {
  id: string;
  method: LoginMethod;
  identifier: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isReady: boolean;
  isAuthenticated: boolean;
  signIn: (method: LoginMethod, identifier: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AUTH_KEY = "smash_auth_v1";
const HAS_GET_ITEM_ASYNC = typeof SecureStore.getItemAsync === "function";
const HAS_SET_ITEM_ASYNC = typeof SecureStore.setItemAsync === "function";
const HAS_DELETE_ITEM_ASYNC = typeof SecureStore.deleteItemAsync === "function";
let secureStoreDisabledForSession = false;

/** Expo SecureStore web shim often lacks native methods; use AsyncStorage only on web. */
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

/** Load auth JSON: SecureStore when healthy, else AsyncStorage fallback. */
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

/** Persist auth JSON: try SecureStore, then AsyncStorage on failure or when disabled. */
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

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await loadAuthJson();
        if (!raw || cancelled) return;
        const parsed = JSON.parse(raw) as AuthUser;
        if (parsed?.id && parsed?.identifier && parsed?.method) {
          setUser(parsed);
        }
      } catch {
        /* invalid JSON or storage read error */
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (method: LoginMethod, identifier: string) => {
    const nextUser: AuthUser = {
      id: `${method}:${identifier}`,
      method,
      identifier,
    };
    setUser(nextUser);
    await saveAuthJson(JSON.stringify(nextUser));
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    await removeAuthEverywhere();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isReady,
      isAuthenticated: Boolean(user),
      signIn,
      signOut,
    }),
    [isReady, signIn, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
