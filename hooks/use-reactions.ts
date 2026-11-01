import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";

import type { Reaction } from "@/components/reactions/types";
import { useAppServices } from "@/lib/services/app-services-context";
import { useReactionsStore } from "@/stores/reactions-store";

export type UseReactionsOptions = {
  conversationId: string | undefined;
};

export function useReactions({ conversationId }: UseReactionsOptions) {
  const { reactionStore, identityStore, syncService } = useAppServices();
  const setConversationReactions = useReactionsStore(
    (s) => s.setConversationReactions,
  );
  const setMessageReactions = useReactionsStore((s) => s.setMessageReactions);
  const byConversation = useReactionsStore((s) =>
    conversationId ? s.byConversation[conversationId] : undefined,
  );
  const [currentUserId, setCurrentUserId] = useState("");

  useEffect(() => {
    void (async () => {
      const identity = await identityStore.getLocalIdentity();
      setCurrentUserId(identity?.userId ?? "");
    })();
  }, [identityStore]);

  const hydrateFromDb = useCallback(async () => {
    if (!conversationId) return;
    const map = await reactionStore.listForConversation(conversationId);
    const record: Record<string, Reaction[]> = {};
    for (const [messageId, reactions] of map) {
      record[messageId] = reactions;
    }
    setConversationReactions(conversationId, record);
  }, [conversationId, reactionStore, setConversationReactions]);

  useEffect(() => {
    void hydrateFromDb();
  }, [hydrateFromDb]);

  useEffect(() => {
    if (!conversationId) return;
    const handler = (changedConversationId: string) => {
      if (changedConversationId !== conversationId) return;
      void hydrateFromDb();
    };
    syncService.setReactionAppliedHandler(handler);
    return () => syncService.setReactionAppliedHandler(null);
  }, [conversationId, hydrateFromDb, syncService]);

  const sendReaction = useCallback(
    async (
      messageId: string,
      emoji: string,
      _recipientDeviceId: string,
      serverEnvelopeId?: string,
    ) => {
      if (!conversationId || !currentUserId) return;
      if (!serverEnvelopeId) {
        if (__DEV__) {
          console.warn(
            "[useReactions] cannot send E2EE reaction without serverEnvelopeId",
          );
        }
        return;
      }

      const previous =
        useReactionsStore.getState().byConversation[conversationId]?.[
          messageId
        ] ?? [];

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const had = await reactionStore.userHasReaction(
        messageId,
        emoji,
        currentUserId,
      );
      const op = had ? "remove" : "add";

      let applied = false;
      try {
        const reactions = await reactionStore.apply(
          messageId,
          emoji,
          currentUserId,
          op,
        );
        applied = true;
        setMessageReactions(conversationId, messageId, reactions);

        await syncService.sendReaction({
          conversationId,
          targetServerEnvelopeId: serverEnvelopeId,
          emoji,
          op,
        });
      } catch {
        if (applied) {
          const reverted = await reactionStore.apply(
            messageId,
            emoji,
            currentUserId,
            op === "add" ? "remove" : "add",
          );
          setMessageReactions(conversationId, messageId, reverted);
        } else {
          setMessageReactions(conversationId, messageId, previous);
        }
      }
    },
    [
      conversationId,
      currentUserId,
      reactionStore,
      setMessageReactions,
      syncService,
    ],
  );

  return {
    reactionsByMessageId: byConversation ?? {},
    sendReaction,
    hydrateFromDb,
    currentUserId,
  };
}
