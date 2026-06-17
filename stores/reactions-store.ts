import { create } from "zustand";

import type { Reaction } from "@/components/reactions/types";

type ReactionsState = {
  /** conversationId → messageId → reactions */
  byConversation: Record<string, Record<string, Reaction[]>>;
  setConversationReactions: (
    conversationId: string,
    reactions: Record<string, Reaction[]>,
  ) => void;
  setMessageReactions: (
    conversationId: string,
    messageId: string,
    reactions: Reaction[],
  ) => void;
  /** Optimistic toggle; returns updated reactions for the message. */
  applyToggle: (
    conversationId: string,
    messageId: string,
    emoji: string,
    userId: string,
  ) => Reaction[];
  addReaction: (
    conversationId: string,
    messageId: string,
    emoji: string,
    userId: string,
  ) => Reaction[];
};

function toggleReactionList(
  reactions: Reaction[],
  emoji: string,
  userId: string,
): Reaction[] {
  const next = reactions.map((r) => ({
    emoji: r.emoji,
    users: [...r.users],
    count: r.count,
  }));
  const existing = next.find((r) => r.emoji === emoji);
  if (existing) {
    const idx = existing.users.indexOf(userId);
    if (idx >= 0) {
      existing.users.splice(idx, 1);
    } else {
      existing.users.push(userId);
    }
    existing.count = existing.users.length;
    return next.filter((r) => r.count > 0);
  }
  return [...next, { emoji, users: [userId], count: 1 }];
}

export const useReactionsStore = create<ReactionsState>((set, get) => ({
  byConversation: {},

  setConversationReactions: (conversationId, reactions) => {
    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [conversationId]: reactions,
      },
    }));
  },

  setMessageReactions: (conversationId, messageId, reactions) => {
    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [conversationId]: {
          ...state.byConversation[conversationId],
          [messageId]: reactions,
        },
      },
    }));
  },

  applyToggle: (conversationId, messageId, emoji, userId) => {
    const conv = get().byConversation[conversationId] ?? {};
    const current = conv[messageId] ?? [];
    const updated = toggleReactionList(current, emoji, userId);
    get().setMessageReactions(conversationId, messageId, updated);
    return updated;
  },

  /** @deprecated use applyToggle — kept for spec compatibility */
  addReaction: (
    conversationId: string,
    messageId: string,
    emoji: string,
    userId: string,
  ) => {
    return get().applyToggle(conversationId, messageId, emoji, userId);
  },
}));
