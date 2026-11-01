import { act, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Platform } from "react-native";

import type { VideoMessageHandle } from "@/components/video-message";
import { useVideoRecorder } from "@/hooks/use-video-recorder";
import { useRecordingStore } from "@/stores/recording-store";

function mockCamera(opts?: {
  uri?: string | null;
  permitted?: boolean;
  failStart?: boolean;
}): VideoMessageHandle & { started: boolean } {
  const state = {
    started: false,
    ensurePermissions: async () => opts?.permitted ?? true,
    startRecording: async () => {
      if (opts?.failStart) throw new Error("camera fail");
      state.started = true;
    },
    stopRecording: async () => {
      state.started = false;
      const uri = opts?.uri === undefined ? "file:///hook-clip.mp4" : opts.uri;
      return uri ? { uri } : null;
    },
  };
  return state;
}

describe("useVideoRecorder (hook-level)", () => {
  let now = 1_000_000;
  const clock = () => now;
  const delay = async (_ms: number) => {
    /* deterministic: no real wait */
  };
  const originalOs = Platform.OS;

  beforeEach(() => {
    now = 1_000_000;
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      get: () => "ios",
    });
    useRecordingStore.setState({
      recordingChatId: null,
      recordingElapsedMs: 0,
      recordingLocked: false,
    });
  });

  afterEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      get: () => originalOs,
    });
  });

  function mountHook(opts?: {
    conversationId?: string;
    minDurationMs?: number;
    maxDurationMs?: number;
    onMaxDuration?: (r: { uri: string; durationMs: number }) => void;
    onError?: (m: string) => void;
  }) {
    const onMaxDuration = opts?.onMaxDuration ?? jest.fn();
    const onError = opts?.onError ?? jest.fn();
    const harness = renderHook(() =>
      useVideoRecorder({
        conversationId: opts?.conversationId ?? "conv_hook",
        minDurationMs: opts?.minDurationMs ?? 1000,
        maxDurationMs: opts?.maxDurationMs ?? 5_000,
        mountDelayMs: 0,
        clock,
        delay,
        onMaxDuration,
        onError,
      }),
    );
    return { ...harness, onMaxDuration, onError };
  }

  it("start sets session/recording and updates recording-store", async () => {
    const { result, unmount } = mountHook();
    const cam = mockCamera();
    result.current!.videoRef.current = cam;

    let ok = false;
    await act(async () => {
      ok = await result.current!.start();
    });

    expect(ok).toBe(true);
    expect(result.current!.sessionActive).toBe(true);
    expect(result.current!.isRecording).toBe(true);
    expect(result.current!.isLocked).toBe(false);
    expect(useRecordingStore.getState().recordingChatId).toBe("conv_hook");
    expect(useRecordingStore.getState().recordingLocked).toBe(false);
    expect(cam.started).toBe(true);
    unmount();
  });

  it("lock sets isLocked and recording-store lock flag", async () => {
    const { result, unmount } = mountHook();
    result.current!.videoRef.current = mockCamera();

    await act(async () => {
      await result.current!.start();
    });
    act(() => {
      result.current!.lock();
    });

    expect(result.current!.isLocked).toBe(true);
    expect(useRecordingStore.getState().recordingLocked).toBe(true);
    unmount();
  });

  it("finish returns file when above min duration and clears store", async () => {
    const { result, unmount } = mountHook({ minDurationMs: 500 });
    result.current!.videoRef.current = mockCamera({
      uri: "file:///finished.mp4",
    });

    await act(async () => {
      await result.current!.start();
    });
    now += 800;

    let finished: { uri: string; durationMs: number } | null = null;
    await act(async () => {
      finished = await result.current!.finish();
    });

    expect(finished).toEqual({ uri: "file:///finished.mp4", durationMs: 800 });
    expect(result.current!.isRecording).toBe(false);
    expect(result.current!.sessionActive).toBe(false);
    expect(useRecordingStore.getState().recordingChatId).toBeNull();
    unmount();
  });

  it("finish returns null when recording is too short", async () => {
    const { result, unmount } = mountHook({ minDurationMs: 1000 });
    result.current!.videoRef.current = mockCamera();

    await act(async () => {
      await result.current!.start();
    });
    now += 200;

    let finished: unknown = "unset";
    await act(async () => {
      finished = await result.current!.finish();
    });

    expect(finished).toBeNull();
    expect(result.current!.isRecording).toBe(false);
    unmount();
  });

  it("discard cancels recording and clears store", async () => {
    const { result, unmount } = mountHook();
    const cam = mockCamera();
    result.current!.videoRef.current = cam;

    await act(async () => {
      await result.current!.start();
    });
    await act(async () => {
      await result.current!.discard();
    });

    expect(result.current!.isRecording).toBe(false);
    expect(result.current!.sessionActive).toBe(false);
    expect(result.current!.isLocked).toBe(false);
    expect(cam.started).toBe(false);
    expect(useRecordingStore.getState().recordingChatId).toBeNull();
    unmount();
  });

  it("max duration auto-stops and invokes onMaxDuration", async () => {
    const onMaxDuration = jest.fn();
    const { result, unmount } = mountHook({
      minDurationMs: 100,
      maxDurationMs: 1_000,
      onMaxDuration,
    });
    result.current!.videoRef.current = mockCamera({
      uri: "file:///max.mp4",
    });

    await act(async () => {
      await result.current!.start();
    });
    now += 1_500;

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });

    expect(onMaxDuration).toHaveBeenCalledWith({
      uri: "file:///max.mp4",
      durationMs: 1500,
    });
    expect(result.current!.isRecording).toBe(false);
    expect(result.current!.sessionActive).toBe(false);
    expect(useRecordingStore.getState().recordingChatId).toBeNull();
    unmount();
  });

  it("permission denied surfaces onError and does not start store", async () => {
    const onError = jest.fn();
    const { result, unmount } = mountHook({ onError });
    result.current!.videoRef.current = mockCamera({ permitted: false });

    let ok = true;
    await act(async () => {
      ok = await result.current!.start();
    });

    expect(ok).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      "Camera and microphone permission are required for video messages.",
    );
    expect(result.current!.isRecording).toBe(false);
    expect(result.current!.sessionActive).toBe(false);
    expect(useRecordingStore.getState().recordingChatId).toBeNull();
    unmount();
  });

  it("camera start failure surfaces onError", async () => {
    const onError = jest.fn();
    const { result, unmount } = mountHook({ onError });
    result.current!.videoRef.current = mockCamera({ failStart: true });

    let ok = true;
    await act(async () => {
      ok = await result.current!.start();
    });

    expect(ok).toBe(false);
    expect(onError).toHaveBeenCalledWith("Could not start the camera.");
    expect(useRecordingStore.getState().recordingChatId).toBeNull();
    unmount();
  });

  it("web platform rejects start with onError", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      get: () => "web",
    });
    const onError = jest.fn();
    const { result, unmount } = mountHook({ onError });
    result.current!.videoRef.current = mockCamera();

    let ok = true;
    await act(async () => {
      ok = await result.current!.start();
    });

    expect(ok).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      "Video messages are not available on web.",
    );
    unmount();
  });

  it("tick updates recording-store elapsed while recording", async () => {
    const { result, unmount } = mountHook();
    result.current!.videoRef.current = mockCamera();

    await act(async () => {
      await result.current!.start();
    });
    now += 400;

    await act(async () => {
      await jest.advanceTimersByTimeAsync(200);
    });

    expect(useRecordingStore.getState().recordingElapsedMs).toBe(400);
    expect(result.current!.elapsedMs).toBe(400);
    unmount();
  });
});
