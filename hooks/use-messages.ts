import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";

import type { LocalMessage } from "@/lib/db/types";
import { useAppServices } from "@/lib/services/app-services-context";

export function useMessages(conversationId: string | undefined) {
  const { messageStore } = useAppServices();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!conversationId) {
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
  }, [conversationId, messageStore]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { messages, loading, reload };
}
