import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ComposerMode = "send" | "voice" | "video";

type InputState = {
  draftsByChatId: Record<string, string>;
  composerModesByChatId: Record<string, ComposerMode>;
  focusedChatId: string | null;
  recordingChatId: string | null;
  recordingElapsedMs: number;
  recordingLocked: boolean;
};

type InputActions = {
  getDraft: (chatId: string) => string;
  setDraft: (chatId: string, text: string) => void;
  clearDraft: (chatId: string) => void;
  
  getComposerMode: (chatId: string) => ComposerMode;
  setComposerMode: (chatId: string, mode: ComposerMode) => void;
  cycleComposerMode: (chatId: string) => void;
  
  setFocusedChat: (chatId: string | null) => void;
  
  startRecording: (chatId: string) => void;
  updateRecordingTime: (elapsedMs: number) => void;
  lockRecording: () => void;
  stopRecording: () => void;
  cancelRecording: () => void;
  
  isRecording: (chatId?: string) => boolean;
};

type InputStore = InputState & InputActions;

export const useInputStore = create<InputStore>()(
  persist(
    (set, get) => ({
      draftsByChatId: {},
      composerModesByChatId: {},
      focusedChatId: null,
      recordingChatId: null,
      recordingElapsedMs: 0,
      recordingLocked: false,

      getDraft: (chatId: string) => {
        return get().draftsByChatId[chatId] || "";
      },

      setDraft: (chatId: string, text: string) => {
        set((state) => ({
          draftsByChatId: {
            ...state.draftsByChatId,
            [chatId]: text,
          },
        }));
      },

      clearDraft: (chatId: string) => {
        set((state) => {
          const newDrafts = { ...state.draftsByChatId };
          delete newDrafts[chatId];
          return { draftsByChatId: newDrafts };
        });
      },

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

      startRecording: (chatId: string) => {
        set({
          recordingChatId: chatId,
          recordingElapsedMs: 0,
          recordingLocked: false,
        });
      },

      updateRecordingTime: (elapsedMs: number) => {
        set({ recordingElapsedMs: elapsedMs });
      },

      lockRecording: () => {
        set({ recordingLocked: true });
      },

      stopRecording: () => {
        set({
          recordingChatId: null,
          recordingElapsedMs: 0,
          recordingLocked: false,
        });
      },

      cancelRecording: () => {
        set({
          recordingChatId: null,
          recordingElapsedMs: 0,
          recordingLocked: false,
        });
      },

      isRecording: (chatId?: string) => {
        const { recordingChatId } = get();
        return chatId ? recordingChatId === chatId : recordingChatId !== null;
      },
    }),
    {
      name: "smash_input_v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        draftsByChatId: state.draftsByChatId,
        composerModesByChatId: state.composerModesByChatId,
      }),
    },
  ),
);
