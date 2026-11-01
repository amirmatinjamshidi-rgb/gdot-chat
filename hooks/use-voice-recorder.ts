import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioRecorder,
} from "expo-audio";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import { VOICE_RECORD_MAX_MS } from "@/lib/config";
import {
  DEFAULT_MIN_VOICE_MS,
  VoiceCaptureSession,
  type VoiceCaptureResult,
} from "@/lib/media/voice-capture";
import { useRecordingStore } from "@/stores/recording-store";

export type UseVoiceRecorderOptions = {
  conversationId: string;
  minDurationMs?: number;
  maxDurationMs?: number;
  clock?: () => number;
  onMaxDuration?: (result: VoiceCaptureResult) => void;
  onError?: (message: string) => void;
};

export type UseVoiceRecorderApi = {
  isRecording: boolean;
  isLocked: boolean;
  elapsedMs: number;
  lock: () => void;
  start: () => Promise<boolean>;
  finish: () => Promise<VoiceCaptureResult | null>;
  discard: () => Promise<void>;
  /** Native AudioRecorder for advanced UI (metering etc.). */
  audioRecorder: AudioRecorder;
};

/**
 * Shared hold-to-record voice capture used by 1:1 ChatRoom and GroupRoom.
 * Wraps expo-audio + VoiceCaptureSession + recording-store.
 */
export function useVoiceRecorder(
  options: UseVoiceRecorderOptions,
): UseVoiceRecorderApi {
  const {
    conversationId,
    minDurationMs = DEFAULT_MIN_VOICE_MS,
    maxDurationMs = VOICE_RECORD_MAX_MS,
    clock = () => Date.now(),
    onMaxDuration,
    onError,
  } = options;

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const audioRecorderRef = useRef(audioRecorder);
  audioRecorderRef.current = audioRecorder;

  const sessionRef = useRef<VoiceCaptureSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new VoiceCaptureSession(
      () => audioRecorderRef.current,
      clock,
      minDurationMs,
    );
  }

  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [tick, setTick] = useState(0);
  const onMaxDurationRef = useRef(onMaxDuration);
  onMaxDurationRef.current = onMaxDuration;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const elapsedMs = useMemo(() => {
    void tick;
    return sessionRef.current?.elapsedMs ?? 0;
  }, [tick, isRecording]);

  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => {
      setTick((n) => n + 1);
      useRecordingStore
        .getState()
        .updateRecordingTime(sessionRef.current?.elapsedMs ?? 0);
    }, 200);
    return () => clearInterval(id);
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) return;
    const id = setTimeout(() => {
      void (async () => {
        if (!sessionRef.current?.isLive) return;
        const result = await sessionRef.current.finish();
        setIsRecording(false);
        setIsLocked(false);
        useRecordingStore.getState().stopRecording();
        if (result) onMaxDurationRef.current?.(result);
      })();
    }, maxDurationMs);
    return () => clearTimeout(id);
  }, [isRecording, maxDurationMs]);

  useEffect(() => {
    return () => {
      sessionRef.current?.cancelPending();
      useRecordingStore.getState().cancelRecording();
      void sessionRef.current?.safeStop();
    };
  }, []);

  const start = useCallback(async () => {
    if (Platform.OS === "web") {
      onErrorRef.current?.("Voice messages are not available on web.");
      return false;
    }
    const session = sessionRef.current!;
    const res = await session.start({
      request: () => requestRecordingPermissionsAsync(),
      setAudioMode: () =>
        setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          interruptionMode: "mixWithOthers",
          shouldPlayInBackground: true,
          shouldRouteThroughEarpiece: true,
        }),
    });
    if (!res.ok) {
      if (res.error !== "cancelled") onErrorRef.current?.(res.error);
      return false;
    }
    setIsLocked(false);
    setIsRecording(true);
    useRecordingStore.getState().startRecording(conversationId);
    return true;
  }, [conversationId]);

  const finish = useCallback(async () => {
    const result = await sessionRef.current!.finish();
    setIsRecording(false);
    setIsLocked(false);
    useRecordingStore.getState().stopRecording();
    return result;
  }, []);

  const discard = useCallback(async () => {
    await sessionRef.current!.discard();
    setIsRecording(false);
    setIsLocked(false);
    useRecordingStore.getState().cancelRecording();
  }, []);

  const lock = useCallback(() => {
    if (!sessionRef.current?.isLive) return;
    setIsLocked(true);
    useRecordingStore.getState().lockRecording();
  }, []);

  return {
    isRecording,
    isLocked,
    elapsedMs,
    lock,
    start,
    finish,
    discard,
    audioRecorder,
  };
}
