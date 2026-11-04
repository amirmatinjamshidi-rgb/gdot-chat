import { requireNativeModule, Platform } from "expo-modules-core";

export type RegisterSessionParams = {
  attachmentId: string;
  fileUri: string;
  keyBase64: string;
  noncePrefixBase64: string;
  plainSize: number;
  chunkSize: number;
  chunkCount: number;
  mimeType: string;
  format: "fixed-slot" | "packed";
};

export type AudioStatus = {
  playing: boolean;
  currentTime: number;
  duration: number;
  didJustFinish: boolean;
};

type NativeModule = {
  registerSession(params: RegisterSessionParams): void;
  unregisterSession(attachmentId: string): void;
  clearAll(): void;
  sessionCount(): number;
  audioPlay(attachmentId: string): Promise<void>;
  audioPause(attachmentId: string): Promise<void>;
  audioSeekTo(attachmentId: string, seconds: number): Promise<void>;
  audioRelease(attachmentId: string): Promise<void>;
  audioStatus(attachmentId: string): Promise<AudioStatus>;
};

const stub: NativeModule = {
  registerSession() {},
  unregisterSession() {},
  clearAll() {},
  sessionCount() {
    return 0;
  },
  async audioPlay() {},
  async audioPause() {},
  async audioSeekTo() {},
  async audioRelease() {},
  async audioStatus() {
    return { playing: false, currentTime: 0, duration: 0, didJustFinish: false };
  },
};

let native: NativeModule = stub;
try {
  if (Platform.OS !== "web") {
    native = requireNativeModule<NativeModule>("GdotEncryptedMedia");
  }
} catch {
  native = stub;
}

export default native;
