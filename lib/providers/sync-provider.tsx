import React, { useEffect, useRef } from "react";

import { useAppLock } from "@/lib/providers/app-lock-provider";
import { useAppServices } from "@/lib/services/app-services-context";

/**
 * Starts sync only while unlocked + DB ready. Stop-before-close on lock is owned by
 * AppLockProvider (runLockShutdown); this cleanup stop is idempotent.
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { syncService } = useAppServices();
  const { dbReady, isUnlocked } = useAppLock();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!dbReady || !isUnlocked) {
      startedRef.current = false;
      return;
    }
    startedRef.current = true;
    void syncService.start();
    return () => {
      startedRef.current = false;
      void syncService.stop();
    };
  }, [dbReady, isUnlocked, syncService]);

  return <>{children}</>;
}
