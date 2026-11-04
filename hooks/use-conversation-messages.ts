import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useRef, useState } from "react";
import { Dimensions, PixelRatio } from "react-native";

import {
  appendOlderMessages,
  mergeMessagesById,
} from "@/lib/chat/merge-messages";
import { messagePageSize } from "@/lib/chat/message-page-size";
import type { LocalAttachment, LocalMessage } from "@/lib/db/types";
import { useAppLock } from "@/lib/providers/app-lock-provider";
import { useAppServices } from "@/lib/services/app-services-context";

const REFRESH_MS = 5_000;

function resolvePageSize(): number {
  const { height } = Dimensions.get("window");
  const fontScale = PixelRatio.getFontScale();
  return messagePageSize(height, fontScale);
}

async function loadAttachmentsFor(
  list: LocalMessage[],
  attachmentStore: {
    get: (id: string) => Promise<LocalAttachment | null>;
  },
  base: Record<string, LocalAttachment> = {},
  mediaVault?: {
    ensurePlaybackUri: (row: LocalAttachment) => Promise<string | undefined>;
  },
): Promise<Record<string, LocalAttachment>> {
  const next = { ...base };
  for (const m of list) {
    if (!m.attachmentId || next[m.attachmentId]) continue;
    const att = await attachmentStore.get(m.attachmentId);
    if (!att) continue;
    if (
      mediaVault &&
      att.transferState === "available" &&
      (att.atRestEncrypted || (att.localUri && att.localUri.endsWith(".genc")))
    ) {
      try {
        const playbackUri = await mediaVault.ensurePlaybackUri(att);
        next[m.attachmentId] = { ...att, playbackUri, atRestEncrypted: true };
        continue;
      } catch {
        /* playback materialization best-effort */
      }
    }
    next[m.attachmentId] = att;
  }
  return next;
}

/**
 * Loads messages for a conversation from SQLCipher (paginated, newest-first).
 * Inbound sync is handled by SyncService (poll + SignalR); this hook only reads.
 * Clears in-memory plaintext when the app locks (lockEpoch).
 */
export function useConversationMessages(conversationId: string | undefined) {
  const { messageStore, attachmentStore, mediaVault } = useAppServices();
  const { dbReady, lockEpoch } = useAppLock();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [attachments, setAttachments] = useState<
    Record<string, LocalAttachment>
  >({});
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = useMemo(() => resolvePageSize(), []);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const loadingOlderRef = useRef(false);
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  const reload = useCallback(async () => {
    if (!conversationId || !dbReady) {
      setMessages([]);
      setAttachments({});
      setHasMore(true);
      setLoading(false);
      return;
    }
    try {
      const latest = await messageStore.listByConversation(
        conversationId,
        pageSize,
      );
      const merged =
        messagesRef.current.length === 0
          ? latest
          : mergeMessagesById(latest, messagesRef.current);
      setMessages(merged);
      if (messagesRef.current.length === 0) {
        setHasMore(latest.length >= pageSize);
      }
      const att = await loadAttachmentsFor(
        merged,
        attachmentStore,
        attachmentsRef.current,
        mediaVault,
      );
      setAttachments(att);
    } finally {
      setLoading(false);
    }
  }, [conversationId, messageStore, attachmentStore, mediaVault, dbReady, pageSize]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || !dbReady) return;
    if (loadingOlderRef.current || !hasMoreRef.current) return;
    const current = messagesRef.current;
    if (current.length === 0) return;
    const oldest = current[0];
    if (!oldest) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const older = await messageStore.listByConversation(
        conversationId,
        pageSize,
        oldest.createdAt,
      );
      if (older.length === 0) {
        setHasMore(false);
        return;
      }
      if (older.length < pageSize) setHasMore(false);
      setMessages((prev) => appendOlderMessages(prev, older));
      const att = await loadAttachmentsFor(
        older,
        attachmentStore,
        attachmentsRef.current,
        mediaVault,
      );
      setAttachments(att);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [conversationId, dbReady, messageStore, pageSize, attachmentStore, mediaVault]);

  useFocusEffect(
    useCallback(() => {
      if (!dbReady) {
        setMessages([]);
        setAttachments({});
        setHasMore(true);
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

  return {
    messages,
    attachments,
    loading,
    loadingOlder,
    hasMore,
    pageSize,
    reload,
    loadOlder,
  };
}
