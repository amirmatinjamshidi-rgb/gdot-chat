import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { Dimensions, PixelRatio } from "react-native";

import { messagePageSize } from "@/lib/chat/message-page-size";
import type { LocalMessage } from "@/lib/db/types";
import { useAppServices } from "@/lib/services/app-services-context";

function resolvePageSize(): number {
  const { height } = Dimensions.get("window");
  const fontScale = PixelRatio.getFontScale();
  return messagePageSize(height, fontScale);
}

/** Lightweight message list (newest-first, screen-sized page). Prefer useConversationMessages in chat rooms. */
export function useMessages(conversationId: string | undefined) {
  const { messageStore } = useAppServices();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const pageSize = useMemo(() => resolvePageSize(), []);

  const reload = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    try {
      const list = await messageStore.listByConversation(
        conversationId,
        pageSize,
      );
      setMessages(list);
    } finally {
      setLoading(false);
    }
  }, [conversationId, messageStore, pageSize]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { messages, loading, reload, pageSize };
}
