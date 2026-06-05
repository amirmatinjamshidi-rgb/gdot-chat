import { useCallback, useEffect, useState } from "react";

import type { LocalProfile } from "@/lib/db/profile-store";
import { useAppLock } from "@/lib/providers/app-lock-provider";
import { useAppServices } from "@/lib/services/app-services-context";

const EMPTY: LocalProfile = {
  displayName: "",
  bio: "",
  phoneE164: "",
  birthday: "",
};

/** Profile fields stored in SQLCipher local_profile table. */
export function useProfilePrefs() {
  const { profileStore } = useAppServices();
  const { dbReady } = useAppLock();
  const [prefs, setPrefs] = useState<LocalProfile>(EMPTY);

  const reload = useCallback(async () => {
    if (!dbReady) return;
    setPrefs(await profileStore.get());
  }, [dbReady, profileStore]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updatePrefs = useCallback(
    async (updates: Partial<LocalProfile>) => {
      if (!dbReady) return;
      await profileStore.save(updates);
      setPrefs(await profileStore.get());
    },
    [dbReady, profileStore],
  );

  const resetPrefs = useCallback(async () => {
    if (!dbReady) return;
    await profileStore.reset();
    setPrefs(EMPTY);
  }, [dbReady, profileStore]);

  return { ...prefs, updatePrefs, resetPrefs, reload };
}
