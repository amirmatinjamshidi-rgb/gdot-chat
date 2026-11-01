import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Platform } from "react-native";

import type { VideoMessageHandle } from "@/components/video-message";
import { VIDEO_RECORD_MAX_MS } from "@/lib/config";
import {
  DEFAULT_MIN_VIDEO_MS,
  DEFAULT_VIDEO_MOUNT_DELAY_MS,
  VideoCaptureSession,
  type VideoCaptureResult,
} from "@/lib/media/video-capture";
import { useRecordingStore } from "@/stores/recording-store";

export type UseVideoRecorderOptions = {
  conversationId: string;
  minDurationMs?: number;
  maxDurationMs?: number;
  mountDelayMs?: number;
  clock?: () => number;
  /** Injected delay for tests (defaults to setTimeout). */
  delay?: (ms: number) => Promise<void>;
  onMaxDuration?: (result: VideoCaptureResult) => void;
  onError?: (message: string) => void;
};

export type UseVideoRecorderApi = {
  /** Attach to `<VideoMessage ref={videoRef} />`. */
  videoRef: RefObject<VideoMessageHandle | null>;
  /** When true, mount the camera UI (`VideoMessage`). */
  sessionActive: boolean;
  isRecording: boolean;
  isLocked: boolean;
  elapsedMs: number;
  lock: () => void;
  start: () => Promise<boolean>;
  finish: () => Promise<VideoCaptureResult | null>;
  discard: () => Promise<void>;
};

/**
 * Shared hold-to-record video capture used by 1:1 ChatRoom and GroupRoom.
 * Owns camera session lifecycle + recording-store; rooms handle send.
 */
export function useVideoRecorder(
  options: UseVideoRecorderOptions,
): UseVideoRecorderApi {
  const {
    conversationId,
    minDurationMs = DEFAULT_MIN_VIDEO_MS,
    maxDurationMs = VIDEO_RECORD_MAX_MS,
    mountDelayMs = DEFAULT_VIDEO_MOUNT_DELAY_MS,
    clock = () => Date.now(),
    delay = (ms) => new Promise((r) => setTimeout(r, ms)),
    onMaxDuration,
    onError,
  } = options;

  const videoRef = useRef<VideoMessageHandle | null>(null);
  const sessionRef = useRef<VideoCaptureSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new VideoCaptureSession(clock, minDurationMs);
  }

  const [sessionActive, setSessionActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [tick, setTick] = useState(0);

  const onMaxDurationRef = useRef(onMaxDuration);
  onMaxDurationRef.current = onMaxDuration;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const delayRef = useRef(delay);
  delayRef.current = delay;
  const mountDelayRef = useRef(mountDelayMs);
  mountDelayRef.current = mountDelayMs;

  const adapter = useMemo(
    () => ({
      ensurePermissions: async () =>
        (await videoRef.current?.ensurePermissions()) ?? false,
      startRecording: async () => {
        await videoRef.current?.startRecording();
      },
      stopRecording: async () =>
        (await videoRef.current?.stopRecording()) ?? null,
    }),
    [],
  );

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
        const result = await sessionRef.current.finish(adapter);
        setIsRecording(false);
        setIsLocked(false);
        setSessionActive(false);
        useRecordingStore.getState().stopRecording();
        if (result) onMaxDurationRef.current?.(result);
      })();
    }, maxDurationMs);
    return () => clearTimeout(id);
  }, [isRecording, maxDurationMs, adapter]);

  useEffect(() => {
    return () => {
      sessionRef.current?.cancelPending();
      useRecordingStore.getState().cancelRecording();
      void sessionRef.current?.discard(adapter);
    };
  }, [adapter]);

  const start = useCallback(async () => {
    if (Platform.OS === "web") {
      onErrorRef.current?.("Video messages are not available on web.");
      return false;
    }
    const session = sessionRef.current!;
    const gen = session.beginSession();
    setSessionActive(true);
    setIsLocked(false);
    const res = await session.start(adapter, {
      gen,
      mountDelayMs: mountDelayRef.current,
      delay: delayRef.current,
    });
    if (!res.ok) {
      setSessionActive(false);
      setIsRecording(false);
      if (res.error !== "cancelled") onErrorRef.current?.(res.error);
      return false;
    }
    setIsRecording(true);
    useRecordingStore.getState().startRecording(conversationId);
    return true;
  }, [adapter, conversationId]);

  const finish = useCallback(async () => {
    const result = await sessionRef.current!.finish(adapter);
    setIsRecording(false);
    setIsLocked(false);
    setSessionActive(false);
    useRecordingStore.getState().stopRecording();
    return result;
  }, [adapter]);

  const discard = useCallback(async () => {
    await sessionRef.current!.discard(adapter);
    setIsRecording(false);
    setIsLocked(false);
    setSessionActive(false);
    useRecordingStore.getState().cancelRecording();
  }, [adapter]);

  const lock = useCallback(() => {
    if (!sessionRef.current?.isLive) return;
    setIsLocked(true);
    useRecordingStore.getState().lockRecording();
  }, []);

  return {
    videoRef,
    sessionActive,
    isRecording,
    isLocked,
    elapsedMs,
    lock,
    start,
    finish,
    discard,
  };
}
