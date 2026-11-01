import { describe, expect, it } from "vitest";
import {
  VoiceCaptureSession,
  type VoiceRecorderAdapter,
} from "@/lib/media/voice-capture";

function mockRecorder(opts?: {
  uri?: string | null;
  failPrepare?: boolean;
}): VoiceRecorderAdapter & { _recording: boolean } {
  const state = {
    _recording: false,
    isRecording: false,
    uri: (opts?.uri ?? null) as string | null,
    prepareToRecordAsync: async () => {
      if (opts?.failPrepare) throw new Error("prepare failed");
    },
    record: async () => {
      state._recording = true;
      state.isRecording = true;
      state.uri = opts?.uri ?? "file:///voice.m4a";
    },
    stop: async () => {
      state._recording = false;
      state.isRecording = false;
    },
  };
  return state;
}

describe("VoiceCaptureSession", () => {
  it("starts, finishes with uri when above min duration (injected clock)", async () => {
    let now = 1_000_000;
    const recorder = mockRecorder({ uri: "file:///rec.m4a" });
    const session = new VoiceCaptureSession(() => recorder, () => now, 1000);
    const perms = {
      request: async () => ({ granted: true }),
      setAudioMode: async () => undefined,
    };
    const start = await session.start(perms);
    expect(start).toEqual({ ok: true });
    expect(session.isLive).toBe(true);
    now += 1500;
    const result = await session.finish();
    expect(result).toEqual({ uri: "file:///rec.m4a", durationMs: 1500 });
    expect(session.isLive).toBe(false);
  });

  it("returns null when recording is too short", async () => {
    let now = 5_000;
    const recorder = mockRecorder();
    const session = new VoiceCaptureSession(() => recorder, () => now, 1000);
    await session.start({
      request: async () => ({ granted: true }),
      setAudioMode: async () => undefined,
    });
    now += 200;
    expect(await session.finish()).toBeNull();
  });

  it("fails when mic permission denied", async () => {
    const recorder = mockRecorder();
    const session = new VoiceCaptureSession(() => recorder, () => 0);
    const res = await session.start({
      request: async () => ({ granted: false }),
      setAudioMode: async () => undefined,
    });
    expect(res).toEqual({
      ok: false,
      error: "Microphone permission is required for voice messages.",
    });
  });

  it("discard stops live recording", async () => {
    const recorder = mockRecorder();
    const session = new VoiceCaptureSession(() => recorder, () => 10);
    await session.start({
      request: async () => ({ granted: true }),
      setAudioMode: async () => undefined,
    });
    expect(session.isLive).toBe(true);
    await session.discard();
    expect(session.isLive).toBe(false);
    expect(recorder.isRecording).toBe(false);
  });

  it("cancelPending aborts an in-flight start", async () => {
    const recorder = mockRecorder();
    const session = new VoiceCaptureSession(() => recorder, () => 0);
    let resolvePerms!: (v: { granted: boolean }) => void;
    const startPromise = session.start({
      request: () =>
        new Promise((resolve) => {
          resolvePerms = resolve;
        }),
      setAudioMode: async () => undefined,
    });
    session.cancelPending();
    resolvePerms({ granted: true });
    const res = await startPromise;
    expect(res).toEqual({ ok: false, error: "cancelled" });
    expect(session.isLive).toBe(false);
  });
});
