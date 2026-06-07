import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";

import type { LocalMessage } from "@/lib/db/types";
import { useAppLock } from "@/lib/providers/app-lock-provider";
import { useAppServices } from "@/lib/services/app-services-context";

const REFRESH_MS = 5_000;

/**
 * Loads messages for a conversation from SQLCipher.
 * Inbound sync is handled by SyncService (poll + SignalR); this hook only reads.
 * Clears in-memory plaintext when the app locks (lockEpoch).
 */
export function useConversationMessages(conversationId: string | undefined) {
  const { messageStore } = useAppServices();
  const { dbReady, lockEpoch } = useAppLock();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!conversationId || !dbReady) {
      setMessages([]);
      setLoading(false);
      return;
    }
    try {
      const list = await messageStore.listByConversation(conversationId, 200);
      setMessages(list);
    } finally {
      setLoading(false);
    }
  }, [conversationId, messageStore, dbReady]);

  useFocusEffect(
    useCallback(() => {
      if (!dbReady) {
        setMessages([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      void reload();
      const timer = setInterval(() => {
        void reload();
      }, REFRESH_MS);
      return () => clearInterval(timer);
    }, [reload, dbReady, lockEpoch]),
  );

  return { messages, loading, reload };
}
