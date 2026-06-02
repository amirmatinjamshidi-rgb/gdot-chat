import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Chat = {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
  unread: number;
};

type ChatsState = {
  chats: Chat[];
  searchQuery: string;
};

type ChatsActions = {
  addChat: (chat: Chat) => void;
  updateChat: (id: string, updates: Partial<Chat>) => void;
  deleteChat: (id: string) => void;
  markAsRead: (id: string) => void;
  setSearchQuery: (query: string) => void;
  getFilteredChats: () => Chat[];
  initializeMockData: () => void;
};

type ChatsStore = ChatsState & ChatsActions;

const MOCK_CHATS: Chat[] = [
  {
    id: "1",
    name: "Alice",
    lastMessage: "Hey, how are you?",
    time: "10:30 AM",
    unread: 2,
  },
  {
    id: "2",
    name: "Bob",
    lastMessage: "Did you see the latest update?",
    time: "Yesterday",
    unread: 0,
  },
  {
    id: "3",
    name: "Charlie",
    lastMessage: "Meeting at 5?",
    time: "Yesterday",
    unread: 1,
  },
  {
    id: "4",
    name: "Diana",
    lastMessage: "Sent the files.",
    time: "Mon",
    unread: 0,
  },
  {
    id: "5",
    name: "Eve",
    lastMessage: "Call me when free.",
    time: "Sun",
    unread: 3,
  },
];

export const useChatsStore = create<ChatsStore>()(
  persist(
    (set, get) => ({
      chats: [],
      searchQuery: "",

      initializeMockData: () => {
        const current = get().chats;
        if (current.length === 0) {
          set({ chats: MOCK_CHATS });
        }
      },

      addChat: (chat: Chat) => {
        set((state) => ({
          chats: [chat, ...state.chats],
        }));
      },

      updateChat: (id: string, updates: Partial<Chat>) => {
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === id ? { ...chat, ...updates } : chat,
          ),
        }));
      },

      deleteChat: (id: string) => {
        set((state) => ({
          chats: state.chats.filter((chat) => chat.id !== id),
        }));
      },

      markAsRead: (id: string) => {
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === id ? { ...chat, unread: 0 } : chat,
          ),
        }));
      },

      setSearchQuery: (query: string) => {
        set({ searchQuery: query });
      },

      getFilteredChats: () => {
        const { chats, searchQuery } = get();
        const q = searchQuery.trim().toLowerCase();
        if (!q) return chats;
        return chats.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.lastMessage.toLowerCase().includes(q),
        );
      },
    }),
    {
      name: "smash_chats_v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        chats: state.chats,
      }),
    },
  ),
);
