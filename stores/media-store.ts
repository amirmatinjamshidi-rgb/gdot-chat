import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Wi-Fi–only vs always vs never (UI labels can map from this). */
export type AutoDownloadPolicy = "wifi" | "always" | "never";

export type ImageSendQuality = "full" | "balanced" | "data_saver";

export type VideoRecordingQuality = "hd" | "standard";

type MediaState = {
  autoDownloadPolicy: AutoDownloadPolicy;
  videoAutoplayInChat: boolean;
  imageSendQuality: ImageSendQuality;
  videoRecordingQuality: VideoRecordingQuality;
};

type MediaActions = {
  setAutoDownloadPolicy: (policy: AutoDownloadPolicy) => void;
  setVideoAutoplayInChat: (enabled: boolean) => void;
  setImageSendQuality: (q: ImageSendQuality) => void;
  setVideoRecordingQuality: (q: VideoRecordingQuality) => void;
};

type MediaStore = MediaState & MediaActions;

export const useMediaStore = create<MediaStore>()(
  persist(
    (set) => ({
      autoDownloadPolicy: "wifi",
      videoAutoplayInChat: true,
      imageSendQuality: "balanced",
      videoRecordingQuality: "hd",

      setAutoDownloadPolicy: (autoDownloadPolicy) => set({ autoDownloadPolicy }),
      setVideoAutoplayInChat: (videoAutoplayInChat) =>
        set({ videoAutoplayInChat }),
      setImageSendQuality: (imageSendQuality) => set({ imageSendQuality }),
      setVideoRecordingQuality: (videoRecordingQuality) =>
        set({ videoRecordingQuality }),
    }),
    {
      name: "smash_media_prefs_v1",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
