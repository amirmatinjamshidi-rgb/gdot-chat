import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";

import type { LocalMessage } from "@/lib/db/types";
import { useAppServices } from "@/lib/services/app-services-context";

const REFRESH_MS = 5_000;

/**
 * Loads messages for a conversation and polls the server for inbound envelopes.
 */
export function useConversationMessages(conversationId: string | undefined) {
  const { messageStore, syncService } = useAppServices();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    try {
      await syncService.pullPending();
      const list = await messageStore.listByConversation(conversationId, 200);
      setMessages(list);
    } finally {
      setLoading(false);
    }
  }, [conversationId, messageStore, syncService]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void reload();
      const timer = setInterval(() => {
        void reload();
      }, REFRESH_MS);
      return () => clearInterval(timer);
    }, [reload]),
  );

  return { messages, loading, reload };
}
