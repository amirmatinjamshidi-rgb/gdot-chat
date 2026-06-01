import * as LocalAuthentication from "expo-local-authentication";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

import { APP_LOCK_BACKGROUND_MS } from "@/lib/config";
import { useAppServices } from "@/lib/services/app-services-context";

type AppLockContextValue = {
  isUnlocked: boolean;
  dbReady: boolean;
  unlock: () => Promise<boolean>;
  lock: () => void;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { appLockStore, kekManager, db } = useAppServices();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [dbReady, setDbReady] = useState(false);

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
    void db.close();
  }, [appLockStore, db]);

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
    });
  }, [appLockStore]);

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

  return (
    <AppLockContext.Provider
      value={{ isUnlocked, dbReady, unlock, lock }}
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
