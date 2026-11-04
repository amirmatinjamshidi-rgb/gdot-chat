import Native, {
  type RegisterSessionParams,
  type AudioStatus,
} from "./GdotEncryptedMediaModule";
import { EncryptedVideo, type EncryptedVideoProps } from "./EncryptedVideo";
import {
  createEncryptedAudioPlayer,
  type EncryptedAudioPlayer,
} from "./encryptedAudio";

export type { RegisterSessionParams, AudioStatus, EncryptedVideoProps, EncryptedAudioPlayer };
export { EncryptedVideo, createEncryptedAudioPlayer };

export function registerSession(params: RegisterSessionParams): void {
  Native.registerSession(params);
}

export function unregisterSession(attachmentId: string): void {
  Native.unregisterSession(attachmentId);
}

/** Clear all playback sessions and zero native keys. Call on app lock / leave chat. */
export function clearAll(): void {
  Native.clearAll();
}

export function sessionCount(): number {
  return Native.sessionCount();
}
