import Native, { type AudioStatus } from "./GdotEncryptedMediaModule";

export type EncryptedAudioPlayer = {
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(seconds: number): Promise<void>;
  release(): Promise<void>;
  getStatus(): Promise<AudioStatus>;
};

export function createEncryptedAudioPlayer(
  attachmentId: string,
): EncryptedAudioPlayer {
  return {
    play: () => Native.audioPlay(attachmentId),
    pause: () => Native.audioPause(attachmentId),
    seekTo: (seconds: number) => Native.audioSeekTo(attachmentId, seconds),
    release: () => Native.audioRelease(attachmentId),
    getStatus: () => Native.audioStatus(attachmentId),
  };
}
