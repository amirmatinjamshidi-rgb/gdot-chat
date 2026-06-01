import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";

import type { Conversation } from "@/lib/db/types";
import { useAppServices } from "@/lib/services/app-services-context";

export function useConversations() {
  const { conversationStore } = useAppServices();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const list = await conversationStore.listAll();
      setConversations(list);
    } finally {
      setLoading(false);
    }
  }, [conversationStore]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { conversations, loading, reload };
}
