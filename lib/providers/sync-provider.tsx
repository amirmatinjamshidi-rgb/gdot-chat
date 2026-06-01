import React, { useEffect } from "react";

import { useAppLock } from "@/lib/providers/app-lock-provider";
import { useAppServices } from "@/lib/services/app-services-context";

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { syncService } = useAppServices();
  const { dbReady, isUnlocked } = useAppLock();

  useEffect(() => {
    if (!dbReady || !isUnlocked) return;
    void syncService.start();
    return () => {
      void syncService.stop();
    };
  }, [dbReady, isUnlocked, syncService]);

  return <>{children}</>;
}
