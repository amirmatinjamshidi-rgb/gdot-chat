import { useCallback, useEffect, useState } from "react";

import { useAppLock } from "@/lib/providers/app-lock-provider";
import { useAppServices } from "@/lib/services/app-services-context";

/** Composer draft backed by SQLCipher (not AsyncStorage). */
export function useComposerDraft(conversationId: string) {
  const { draftStore } = useAppServices();
  const { dbReady } = useAppLock();
  const [draft, setDraftState] = useState("");

  useEffect(() => {
    if (!dbReady || !conversationId) {
      setDraftState("");
      return;
    }
    void draftStore.get(conversationId).then(setDraftState);
  }, [conversationId, dbReady, draftStore]);

  const setDraft = useCallback(
    (text: string) => {
      setDraftState(text);
      if (dbReady && conversationId) {
        void draftStore.set(conversationId, text);
      }
    },
    [conversationId, dbReady, draftStore],
  );

  const clearDraft = useCallback(() => {
    setDraftState("");
    if (dbReady && conversationId) {
      void draftStore.clear(conversationId);
    }
  }, [conversationId, dbReady, draftStore]);

  return { draft, setDraft, clearDraft };
}
