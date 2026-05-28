import * as SecureStore from "expo-secure-store";
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

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await SecureStore.getItemAsync(AUTH_KEY);
        if (!raw || cancelled) return;
        const parsed = JSON.parse(raw) as AuthUser;
        if (parsed?.id && parsed?.identifier && parsed?.method) {
          setUser(parsed);
        }
      } catch {
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (method: LoginMethod, identifier: string) => {
      const nextUser: AuthUser = {
        id: `${method}:${identifier}`,
        method,
        identifier,
      };
      setUser(nextUser);
      await SecureStore.setItemAsync(AUTH_KEY, JSON.stringify(nextUser));
    },
    [],
  );

  const signOut = useCallback(async () => {
    setUser(null);
    await SecureStore.deleteItemAsync(AUTH_KEY);
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
