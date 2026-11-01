import React, { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { useAppLock } from "@/lib/providers/app-lock-provider";
import { useAppServices } from "@/lib/services/app-services-context";

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { syncService } = useAppServices();
  const { dbReady, isUnlocked } = useAppLock();
  const activeRef = useRef(false);

  useEffect(() => {
    if (!dbReady || !isUnlocked) {
      activeRef.current = false;
      return;
    }
    activeRef.current = true;
    void syncService.start();
    return () => {
      activeRef.current = false;
      void syncService.stop();
    };
  }, [dbReady, isUnlocked, syncService]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (!activeRef.current) return;
      if (state === "background") {
        void syncService.pauseForBackground();
      } else if (state === "active") {
        void syncService.resumeFromForeground();
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [syncService]);

  return <>{children}</>;
}
