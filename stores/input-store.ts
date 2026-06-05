import { create } from "zustand";

export type ComposerMode = "send" | "voice" | "video";

type InputState = {
  composerModesByChatId: Record<string, ComposerMode>;
  focusedChatId: string | null;
};

type InputActions = {
  getComposerMode: (chatId: string) => ComposerMode;
  setComposerMode: (chatId: string, mode: ComposerMode) => void;
  cycleComposerMode: (chatId: string) => void;
  setFocusedChat: (chatId: string | null) => void;
};

type InputStore = InputState & InputActions;

/** In-memory only — drafts live in SQLCipher via useComposerDraft. */
export const useInputStore = create<InputStore>()((set, get) => ({
  composerModesByChatId: {},
  focusedChatId: null,

  getComposerMode: (chatId: string) => {
    return get().composerModesByChatId[chatId] || "send";
  },

  setComposerMode: (chatId: string, mode: ComposerMode) => {
    set((state) => ({
      composerModesByChatId: {
        ...state.composerModesByChatId,
        [chatId]: mode,
      },
    }));
  },

  cycleComposerMode: (chatId: string) => {
    const current = get().getComposerMode(chatId);
    const next: ComposerMode =
      current === "send" ? "voice" : current === "voice" ? "video" : "send";
    get().setComposerMode(chatId, next);
  },

  setFocusedChat: (chatId: string | null) => {
    set({ focusedChatId: chatId });
  },
}));
