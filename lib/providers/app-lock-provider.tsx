import { type Href, usePathname, useRouter } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
import { ensureSignalInitialized } from "@/lib/crypto/init-signal";
import { useAppServices } from "@/lib/services/app-services-context";
import { shouldLockOnAppStateChange } from "@/lib/session/app-lock-store";
import { runLockShutdown } from "@/lib/session/lock-shutdown";

export type UnlockResult =
  | { ok: true }
  | { ok: false; code: AppAuthErrorCode };

type AppLockContextValue = {
  isUnlocked: boolean;
  dbReady: boolean;
  lockEpoch: number;
  unlock: (pin?: string) => Promise<UnlockResult>;
  lock: () => void;
  /** Suppress immediate background lock (OS dialogs, biometric UI). */
  beginSuppressBackgroundLock: () => void;
  endSuppressBackgroundLock: () => void;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

const LOCK_ROUTE = "/lock";
export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { appLockStore, kekManager, db, syncService, mediaVault } = useAppServices();
  const router = useRouter();
  const pathname = usePathname();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [lockEpoch, setLockEpoch] = useState(0);
  const unlockInProgressRef = useRef(false);
  const pathnameRef = useRef(pathname);
  const routerRef = useRef(router);
  pathnameRef.current = pathname;
  routerRef.current = router;

  useEffect(() => {
    void ensureSignalInitialized();
  }, []);

  const openDatabase = useCallback(
    async (pin?: string) => {
      if (!db.isOpen()) {
        const passphrase = await kekManager.getPassphraseForDb({ pin });
        await db.open(passphrase);
      }
      setDbReady(true);
    },
    [db, kekManager],
  );

  const lock = useCallback(() => {
    appLockStore.lock();
  }, [appLockStore]);

  const beginSuppressBackgroundLock = useCallback(() => {
    appLockStore.beginSuppressBackgroundLock();
  }, [appLockStore]);

  const endSuppressBackgroundLock = useCallback(() => {
    appLockStore.endSuppressBackgroundLock();
  }, [appLockStore]);

  const unlock = useCallback(
    async (pin?: string): Promise<UnlockResult> => {
      unlockInProgressRef.current = true;
      appLockStore.beginSuppressBackgroundLock();
      try {
        // Biometric: SecureStore requireAuthentication only (one prompt).
        // PIN mode: unwrap KEK with app PIN (no SecureStore biometric gate).
        // If DB is already open (e.g. right after login/register), skip unwrap.
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
      } finally {
        unlockInProgressRef.current = false;
        appLockStore.endSuppressBackgroundLock();
      }
    },
    [openDatabase, appLockStore],
  );

  useEffect(() => {
    return appLockStore.onLock(() => {
      // Clear cache first (sync) so /lock warm-path cannot auto-unlock
      // against the async DB close.
      kekManager.clearCachedPassphrase();
      // Clear native streaming media keys and wipe any leftover gdot-media-tmp (Documents stay ciphertext-only).
      void mediaVault.clearOnLock();
      setIsUnlocked(false);
      setDbReady(false);
      setLockEpoch((n) => n + 1);
      // Navigate synchronously — deferred replace while backgrounded is dropped.
      const path = pathnameRef.current;
      if (!isPublicRoute(path)) {
        routerRef.current.replace(LOCK_ROUTE as Href);
      }
      // stop sync/SignalR (+ abort HTTP) before draining/closing DB.
      void runLockShutdown({
        stopSync: () => syncService.stop(),
        closeDb: () => db.close(),
      });
    });
  }, [appLockStore, kekManager, db, syncService, mediaVault]);

  // Stable subscription — pathname/router read via refs so we never flip the listener.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      const unlockInProgress = unlockInProgressRef.current;
      const suppressing = appLockStore.isSuppressingBackgroundLock();
      const path = pathnameRef.current;
      if (
        shouldLockOnAppStateChange(state, {
          unlockInProgress,
          suppressingBackgroundLock: suppressing,
        })
      ) {
        appLockStore.lock();
        return;
      }
      // Resume while locked: ensure /lock even if a background replace was dropped.
      if (
        state === "active" &&
        !unlockInProgress &&
        !suppressing &&
        !appLockStore.isUnlocked &&
        !isPublicRoute(path)
      ) {
        routerRef.current.replace(LOCK_ROUTE as Href);
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
      value={{
        isUnlocked,
        dbReady,
        lockEpoch,
        unlock,
        lock,
        beginSuppressBackgroundLock,
        endSuppressBackgroundLock,
      }}
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
