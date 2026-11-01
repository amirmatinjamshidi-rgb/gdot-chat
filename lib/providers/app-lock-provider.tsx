import { type Href, usePathname, useRouter } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  AppAuthError,
  type AppAuthErrorCode,
  isUserCancelAuth,
} from "@/lib/auth/app-auth-error";
import { mapSecureStoreAuthError } from "@/lib/auth/biometric-capability";
import { isPublicRoute } from "@/lib/auth/public-routes";
import { APP_LOCK_BACKGROUND_MS } from "@/lib/config";
import { ensureSignalInitialized } from "@/lib/crypto/init-signal";
import { useAppServices } from "@/lib/services/app-services-context";

export type UnlockResult =
  | { ok: true }
  | { ok: false; code: AppAuthErrorCode };

type AppLockContextValue = {
  isUnlocked: boolean;
  dbReady: boolean;
  lockEpoch: number;
  unlock: (pin?: string) => Promise<UnlockResult>;
  lock: () => void;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

const LOCK_ROUTE = "/lock";
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

  const openDatabase = useCallback(async (pin?: string) => {
    if (!db.isOpen()) {
      const passphrase = await kekManager.getPassphraseForDb({ pin });
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

  const unlock = useCallback(async (pin?: string): Promise<UnlockResult> => {
    try {
      // Biometric: LocalAuthentication + SecureStore KEK.
      // PIN mode: unwrap KEK with app PIN (no SecureStore biometric gate).
      await openDatabase(pin);
      appLockStore.unlock();
      setIsUnlocked(true);
      return { ok: true };
    } catch (error) {
      if (isUserCancelAuth(error)) {
        return { ok: false, code: "USER_CANCEL" };
      }
      const mapped =
        error instanceof AppAuthError
          ? error
          : mapSecureStoreAuthError(error);
      return { ok: false, code: mapped.code };
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
