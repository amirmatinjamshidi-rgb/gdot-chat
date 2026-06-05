import * as LocalAuthentication from "expo-local-authentication";
import { type Href, usePathname, useRouter } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

import { APP_LOCK_BACKGROUND_MS } from "@/lib/config";
import { ensureSignalInitialized } from "@/lib/crypto/init-signal";
import { useAppServices } from "@/lib/services/app-services-context";

type AppLockContextValue = {
  isUnlocked: boolean;
  dbReady: boolean;
  lockEpoch: number;
  unlock: () => Promise<boolean>;
  lock: () => void;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

const LOCK_ROUTE = "/lock";
function isPublicRoute(path: string): boolean {
  if (
    path === "/" ||
    path === "/lock" ||
    path === "/login" ||
    path === "/verify-otp" ||
    path.endsWith("/login") ||
    path.endsWith("/register")
  ) {
    return true;
  }
  return path.includes("(auth)");
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { appLockStore, kekManager, db } = useAppServices();
  const router = useRouter();
  const pathname = usePathname();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [lockEpoch, setLockEpoch] = useState(0);

  useEffect(() => {
    void ensureSignalInitialized();
  }, []);

  const openDatabase = useCallback(async () => {
    const passphrase = await kekManager.getPassphraseForDb();
    if (!db.isOpen()) {
      await db.open(passphrase);
    }
    setDbReady(true);
  }, [db, kekManager]);

  const lock = useCallback(() => {
    appLockStore.lock();
    setIsUnlocked(false);
    setDbReady(false);
    setLockEpoch((n) => n + 1);
    void db.close();
    if (!isPublicRoute(pathname)) {
      router.replace(LOCK_ROUTE as Href);
    }
  }, [appLockStore, db, pathname, router]);

  const unlock = useCallback(async (): Promise<boolean> => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (hasHardware) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Unlock Gdot Chat",
        });
        if (!result.success) return false;
      }
      await openDatabase();
      appLockStore.unlock();
      setIsUnlocked(true);
      return true;
    } catch {
      return false;
    }
  }, [openDatabase, appLockStore]);

  useEffect(() => {
    return appLockStore.onLock(() => {
      setIsUnlocked(false);
      setDbReady(false);
      setLockEpoch((n) => n + 1);
      if (!isPublicRoute(pathname)) {
        router.replace(LOCK_ROUTE as Href);
      }
    });
  }, [appLockStore, pathname, router]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        appLockStore.onBackground(APP_LOCK_BACKGROUND_MS);
      } else if (state === "active") {
        appLockStore.onForeground();
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [appLockStore]);

  useEffect(() => {
    if (!dbReady && !isPublicRoute(pathname)) {
      router.replace(LOCK_ROUTE as Href);
    }
  }, [dbReady, pathname, router]);

  return (
    <AppLockContext.Provider
      value={{ isUnlocked, dbReady, lockEpoch, unlock, lock }}
    >
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock requires AppLockProvider");
  return ctx;
}
