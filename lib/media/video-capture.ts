/** Platform-agnostic video capture session (hold-to-record lifecycle). */

export const DEFAULT_MIN_VIDEO_MS = 1000;
export const DEFAULT_VIDEO_MOUNT_DELAY_MS = 160;

export type VideoCameraAdapter = {
  ensurePermissions: () => Promise<boolean>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<{ uri: string } | null>;
};

export type VideoCaptureResult = {
  uri: string;
  durationMs: number;
};

export type VideoCaptureStartOk = { ok: true };
export type VideoCaptureStartErr = { ok: false; error: string };
export type VideoCaptureStartResult = VideoCaptureStartOk | VideoCaptureStartErr;

export class VideoCaptureSession {
  private gen = 0;
  private startedAt = 0;
  private live = false;

  constructor(
    private readonly clock: () => number = () => Date.now(),
    private readonly minDurationMs = DEFAULT_MIN_VIDEO_MS,
  ) {}

  get isLive(): boolean {
    return this.live;
  }

  get elapsedMs(): number {
    if (!this.live) return 0;
    return Math.max(0, this.clock() - this.startedAt);
  }

  /** Bump generation so in-flight starts abort. */
  cancelPending(): void {
    this.gen += 1;
  }

  /**
   * Begin a camera UI session. Caller should mount the camera view, then call
   * {@link start} with the returned generation token.
   */
  beginSession(): number {
    this.gen += 1;
    this.live = false;
    this.startedAt = 0;
    return this.gen;
  }

  async start(
    adapter: VideoCameraAdapter,
    opts: {
      gen: number;
      mountDelayMs?: number;
      delay?: (ms: number) => Promise<void>;
    },
  ): Promise<VideoCaptureStartResult> {
    const {
      gen,
      mountDelayMs = DEFAULT_VIDEO_MOUNT_DELAY_MS,
      delay = (ms) => new Promise((r) => setTimeout(r, ms)),
    } = opts;

    await delay(mountDelayMs);
    if (gen !== this.gen) return { ok: false, error: "cancelled" };

    let permitted = false;
    try {
      permitted = await adapter.ensurePermissions();
    } catch {
      return { ok: false, error: "Could not start the camera." };
    }
    if (gen !== this.gen) return { ok: false, error: "cancelled" };
    if (!permitted) {
      return {
        ok: false,
        error:
          "Camera and microphone permission are required for video messages.",
      };
    }

    try {
      await adapter.startRecording();
    } catch {
      return { ok: false, error: "Could not start the camera." };
    }
    if (gen !== this.gen) {
      try {
        await adapter.stopRecording();
      } catch {
        /* noop */
      }
      return { ok: false, error: "cancelled" };
    }

    this.live = true;
    this.startedAt = this.clock();
    return { ok: true };
  }

  async finish(
    adapter: VideoCameraAdapter,
  ): Promise<VideoCaptureResult | null> {
    const durationMs = this.live
      ? Math.max(0, this.clock() - this.startedAt)
      : 0;
    let recorded: { uri: string } | null = null;
    try {
      recorded = (await adapter.stopRecording()) ?? null;
    } catch {
      recorded = null;
    }
    this.live = false;
    this.startedAt = 0;
    if (!recorded?.uri || durationMs < this.minDurationMs) return null;
    return { uri: recorded.uri, durationMs };
  }

  async discard(adapter: VideoCameraAdapter): Promise<void> {
    this.gen += 1;
    this.live = false;
    this.startedAt = 0;
    try {
      await adapter.stopRecording();
    } catch {
      /* noop */
    }
  }
}
