import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
  messagesByChatId: Record<string, Message[]>;
  activePlaybackId: string | null;
};

type MessagesActions = {
  addMessage: (chatId: string, message: Message) => void;
  updateMessage: (chatId: string, messageId: string, updates: Partial<Message>) => void;
  deleteMessage: (chatId: string, messageId: string) => void;
  getMessagesForChat: (chatId: string) => Message[];
  setActivePlayback: (messageId: string | null) => void;
  clearChatMessages: (chatId: string) => void;
  initializeMockMessages: (chatId: string) => void;
};

type MessagesStore = MessagesState & MessagesActions;

const MOCK_MESSAGES: Message[] = [
  {
    id: "1",
    chatId: "default",
    text: "Hey there!",
    sender: "me",
    time: "10:30 AM",
    kind: "text",
    isMine: true,
  },
  {
    id: "2",
    chatId: "default",
    text: "Hi! How is the project going?",
    sender: "Alice",
    time: "10:31 AM",
    kind: "text",
    isMine: false,
  },
  {
    id: "3",
    chatId: "default",
    text: "It is going great! Just setting up the routes.",
    sender: "me",
    time: "10:32 AM",
    kind: "text",
    isMine: true,
  },
];

export const useMessagesStore = create<MessagesStore>()(
  persist(
    (set, get) => ({
      messagesByChatId: {},
      activePlaybackId: null,

      initializeMockMessages: (chatId: string) => {
        const current = get().messagesByChatId[chatId];
        if (!current || current.length === 0) {
          set((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: MOCK_MESSAGES.map((msg) => ({ ...msg, chatId })),
            },
          }));
        }
      },

      addMessage: (chatId: string, message: Message) => {
        set((state) => {
          const existing = state.messagesByChatId[chatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: [...existing, message],
            },
          };
        });
      },

      updateMessage: (chatId: string, messageId: string, updates: Partial<Message>) => {
        set((state) => {
          const messages = state.messagesByChatId[chatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: messages.map((msg) =>
                msg.id === messageId ? { ...msg, ...updates } : msg,
              ),
            },
          };
        });
      },

      deleteMessage: (chatId: string, messageId: string) => {
        set((state) => {
          const messages = state.messagesByChatId[chatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: messages.filter((msg) => msg.id !== messageId),
            },
          };
        });
      },

      getMessagesForChat: (chatId: string) => {
        return get().messagesByChatId[chatId] || [];
      },

      setActivePlayback: (messageId: string | null) => {
        set({ activePlaybackId: messageId });
      },

      clearChatMessages: (chatId: string) => {
        set((state) => {
          const newMessages = { ...state.messagesByChatId };
          delete newMessages[chatId];
          return { messagesByChatId: newMessages };
        });
      },
    }),
    {
      name: "smash_messages_v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        messagesByChatId: state.messagesByChatId,
      }),
    },
  ),
);
