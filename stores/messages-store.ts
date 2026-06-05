import { create } from "zustand";

export type MessageKind = "text" | "voice" | "video" | "story";

export type Message = {
  id: string;
  chatId: string;
  sender: string;
  time: string;
  kind: MessageKind;
  text?: string;
  durationMs?: number;
  mediaUri?: string;
  storyUri?: string;
  isMine?: boolean;
};

type MessagesState = {
  /** Ephemeral voice/video playback UI only — not persisted. */
  ephemeralByChatId: Record<string, Message[]>;
  activePlaybackId: string | null;
};

type MessagesActions = {
  addEphemeral: (chatId: string, message: Message) => void;
  clearEphemeral: (chatId: string) => void;
  getEphemeralForChat: (chatId: string) => Message[];
  setActivePlayback: (messageId: string | null) => void;
};

type MessagesStore = MessagesState & MessagesActions;

export const useMessagesStore = create<MessagesStore>()((set, get) => ({
  ephemeralByChatId: {},
  activePlaybackId: null,

  addEphemeral: (chatId: string, message: Message) => {
    set((state) => {
      const existing = state.ephemeralByChatId[chatId] || [];
      return {
        ephemeralByChatId: {
          ...state.ephemeralByChatId,
          [chatId]: [...existing, message],
        },
      };
    });
  },

  clearEphemeral: (chatId: string) => {
    set((state) => {
      const next = { ...state.ephemeralByChatId };
      delete next[chatId];
      return { ephemeralByChatId: next };
    });
  },

  getEphemeralForChat: (chatId: string) => {
    return get().ephemeralByChatId[chatId] || [];
  },

  setActivePlayback: (messageId: string | null) => {
    set({ activePlaybackId: messageId });
  },
}));
