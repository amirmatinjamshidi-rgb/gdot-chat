import { type Href, useRouter, useSegments } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { useAppServices } from "@/lib/services/app-services-context";

type AuthContextValue = {
  isLoading: boolean;
  isLoggedIn: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { authStore, db, appLockStore, syncService } = useAppServices();
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  const refresh = useCallback(async () => {
    setIsLoggedIn(await authStore.isLoggedIn());
  }, [authStore]);

  const signOut = useCallback(async () => {
    await syncService.stop();
    await db.close();
    await authStore.clear();
    appLockStore.lock();
    setIsLoggedIn(false);
  }, [authStore, db, appLockStore, syncService]);

  useEffect(() => {
    void refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (isLoading) return;
    const root = segments[0] as string | undefined;
    const inAuth = root === "(auth)";
    if (!isLoggedIn && !inAuth) {
      router.replace("/(auth)/login" as Href);
    } else if (isLoggedIn && inAuth) {
      router.replace("/lock" as Href);
    }
  }, [isLoading, isLoggedIn, segments, router]);

  return (
    <AuthContext.Provider value={{ isLoading, isLoggedIn, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth requires AuthProvider");
  return ctx;
}
