import { describe, expect, it } from "vitest";

import {
  VideoCaptureSession,
  type VideoCameraAdapter,
} from "@/lib/media/video-capture";

function mockCamera(opts?: {
  uri?: string | null;
  permitted?: boolean;
  failStart?: boolean;
}): VideoCameraAdapter & { started: boolean } {
  const state = {
    started: false,
    ensurePermissions: async () => opts?.permitted ?? true,
    startRecording: async () => {
      if (opts?.failStart) throw new Error("camera fail");
      state.started = true;
    },
    stopRecording: async () => {
      state.started = false;
      const uri = opts?.uri ?? "file:///clip.mp4";
      return uri ? { uri } : null;
    },
  };
  return state;
}

describe("VideoCaptureSession", () => {
  it("starts after mount delay and finishes with uri (injected clock)", async () => {
    let now = 2_000_000;
    const cam = mockCamera({ uri: "file:///v.mp4" });
    const session = new VideoCaptureSession(() => now, 1000);
    const delays: number[] = [];
    const gen = session.beginSession();
    const start = await session.start(cam, {
      gen,
      mountDelayMs: 50,
      delay: async (ms) => {
        delays.push(ms);
      },
    });
    expect(start).toEqual({ ok: true });
    expect(delays).toEqual([50]);
    expect(session.isLive).toBe(true);
    now += 1500;
    const result = await session.finish(cam);
    expect(result).toEqual({ uri: "file:///v.mp4", durationMs: 1500 });
    expect(session.isLive).toBe(false);
  });

  it("returns null when recording is too short", async () => {
    let now = 100;
    const cam = mockCamera();
    const session = new VideoCaptureSession(() => now, 1000);
    const gen = session.beginSession();
    await session.start(cam, { gen, mountDelayMs: 0, delay: async () => {} });
    now += 200;
    expect(await session.finish(cam)).toBeNull();
  });

  it("fails when camera permission denied", async () => {
    const cam = mockCamera({ permitted: false });
    const session = new VideoCaptureSession(() => 0);
    const gen = session.beginSession();
    const res = await session.start(cam, {
      gen,
      mountDelayMs: 0,
      delay: async () => {},
    });
    expect(res).toEqual({
      ok: false,
      error:
        "Camera and microphone permission are required for video messages.",
    });
  });

  it("discard stops live recording", async () => {
    const cam = mockCamera();
    const session = new VideoCaptureSession(() => 10);
    const gen = session.beginSession();
    await session.start(cam, { gen, mountDelayMs: 0, delay: async () => {} });
    expect(session.isLive).toBe(true);
    await session.discard(cam);
    expect(session.isLive).toBe(false);
    expect(cam.started).toBe(false);
  });

  it("cancelPending / gen mismatch aborts in-flight start", async () => {
    const cam = mockCamera();
    const session = new VideoCaptureSession(() => 0);
    const gen = session.beginSession();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const startPromise = session.start(cam, {
      gen,
      mountDelayMs: 10,
      delay: async () => gate,
    });
    session.cancelPending();
    release();
    const res = await startPromise;
    expect(res).toEqual({ ok: false, error: "cancelled" });
    expect(session.isLive).toBe(false);
  });

  it("failStart surfaces camera error", async () => {
    const cam = mockCamera({ failStart: true });
    const session = new VideoCaptureSession(() => 0);
    const gen = session.beginSession();
    const res = await session.start(cam, {
      gen,
      mountDelayMs: 0,
      delay: async () => {},
    });
    expect(res).toEqual({ ok: false, error: "Could not start the camera." });
  });
});

