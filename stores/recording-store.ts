import { create } from "zustand";

/**
 * Ephemeral hold-to-record session (voice/video in chat composer).
 * Not persisted — mirrors native recorder lifecycle for global UI / future features.
 */
type RecordingState = {
  recordingChatId: string | null;
  recordingElapsedMs: number;
  recordingLocked: boolean;
};

type RecordingActions = {
  startRecording: (chatId: string) => void;
  updateRecordingTime: (elapsedMs: number) => void;
  lockRecording: () => void;
  stopRecording: () => void;
  cancelRecording: () => void;
  isRecording: (chatId?: string) => boolean;
};

type RecordingStore = RecordingState & RecordingActions;

export const useRecordingStore = create<RecordingStore>()((set, get) => ({
  recordingChatId: null,
  recordingElapsedMs: 0,
  recordingLocked: false,

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
}));
