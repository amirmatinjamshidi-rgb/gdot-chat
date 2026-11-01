import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";

import type { LocalAttachment, LocalMessage } from "@/lib/db/types";
import { useAppLock } from "@/lib/providers/app-lock-provider";
import { useAppServices } from "@/lib/services/app-services-context";

const REFRESH_MS = 5_000;

/**
 * Loads messages for a conversation from SQLCipher.
 * Inbound sync is handled by SyncService (poll + SignalR); this hook only reads.
 * Clears in-memory plaintext when the app locks (lockEpoch).
 */
export function useConversationMessages(conversationId: string | undefined) {
  const { messageStore, attachmentStore } = useAppServices();
  const { dbReady, lockEpoch } = useAppLock();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [attachments, setAttachments] = useState<
    Record<string, LocalAttachment>
  >({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!conversationId || !dbReady) {
      setMessages([]);
      setAttachments({});
      setLoading(false);
      return;
    }
    try {
      const list = await messageStore.listByConversation(conversationId, 200);
      const next: Record<string, LocalAttachment> = {};
      for (const m of list) {
        if (!m.attachmentId) continue;
        const att = await attachmentStore.get(m.attachmentId);
        if (att) next[m.attachmentId] = att;
      }
      setMessages(list);
      setAttachments(next);
    } finally {
      setLoading(false);
    }
  }, [conversationId, messageStore, attachmentStore, dbReady]);

  useFocusEffect(
    useCallback(() => {
      if (!dbReady) {
        setMessages([]);
        setAttachments({});
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

  return { messages, attachments, loading, reload };
}
