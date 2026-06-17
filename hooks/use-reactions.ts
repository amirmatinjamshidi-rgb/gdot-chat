import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";

import type { Reaction, ReactionPayload } from "@/components/reactions/types";
import { useAppServices } from "@/lib/services/app-services-context";
import { useReactionsStore } from "@/stores/reactions-store";

export type UseReactionsOptions = {
  conversationId: string | undefined;
};

export function useReactions({ conversationId }: UseReactionsOptions) {
  const {
    reactionStore,
    reactionsApi,
    signalr,
    identityStore,
    messageStore,
  } = useAppServices();
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
    const handler = async (payload: ReactionPayload) => {
      if (!conversationId || payload.conversationId !== conversationId) return;
      if (payload.userId === currentUserId) return;

      let messageId = payload.messageId;
      if (payload.serverEnvelopeId) {
        const match = await messageStore.getByServerEnvelopeId(
          payload.serverEnvelopeId,
        );
        if (match) messageId = match.id;
      }

      const reactions = await reactionStore.toggle(
        messageId,
        payload.emoji,
        payload.userId,
      );
      setMessageReactions(conversationId, messageId, reactions);
    };

    signalr.setReactionHandler(handler);
    return () => signalr.setReactionHandler(null);
  }, [
    conversationId,
    currentUserId,
    messageStore,
    reactionStore,
    setMessageReactions,
    signalr,
  ]);

  const sendReaction = useCallback(
    async (
      messageId: string,
      emoji: string,
      recipientDeviceId: string,
      serverEnvelopeId?: string,
    ) => {
      if (!conversationId || !currentUserId) return;

      const previous =
        useReactionsStore.getState().byConversation[conversationId]?.[
          messageId
        ] ?? [];

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      let toggled = false;
      try {
        const reactions = await reactionStore.toggle(
          messageId,
          emoji,
          currentUserId,
        );
        toggled = true;
        setMessageReactions(conversationId, messageId, reactions);

        const payload: ReactionPayload = {
          messageId,
          conversationId,
          emoji,
          userId: currentUserId,
          recipientDeviceId,
          serverEnvelopeId,
        };
        await reactionsApi.send(payload);
        await signalr.sendReaction(payload);
      } catch {
        if (toggled) {
          const reverted = await reactionStore.toggle(
            messageId,
            emoji,
            currentUserId,
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
      reactionsApi,
      setMessageReactions,
      signalr,
    ],
  );

  return {
    reactionsByMessageId: byConversation ?? {},
    sendReaction,
    hydrateFromDb,
    currentUserId,
  };
}
