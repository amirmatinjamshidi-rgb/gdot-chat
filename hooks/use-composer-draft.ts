import { useCallback, useEffect, useRef, useState } from "react";

import { useAppLock } from "@/lib/providers/app-lock-provider";
import { useAppServices } from "@/lib/services/app-services-context";

const DRAFT_SAVE_MS = 400;

/** Composer draft backed by SQLCipher (not AsyncStorage). */
export function useComposerDraft(conversationId: string) {
  const { draftStore } = useAppServices();
  const { dbReady } = useAppLock();
  const [draft, setDraftState] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dbReady || !conversationId) {
      setDraftState("");
      return;
    }
    void draftStore.get(conversationId).then(setDraftState);
  }, [conversationId, dbReady, draftStore]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const setDraft = useCallback(
    (text: string) => {
      setDraftState(text);
      if (!dbReady || !conversationId) return;

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void draftStore.set(conversationId, text);
      }, DRAFT_SAVE_MS);
    },
    [conversationId, dbReady, draftStore],
  );

  const clearDraft = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setDraftState("");
    if (dbReady && conversationId) {
      void draftStore.clear(conversationId);
    }
  }, [conversationId, dbReady, draftStore]);

  return { draft, setDraft, clearDraft };
}
