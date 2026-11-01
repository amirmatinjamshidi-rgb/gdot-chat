/** Platform-agnostic voice capture session (hold-to-record lifecycle). */

export const DEFAULT_MIN_VOICE_MS = 1000;

export type VoiceRecorderAdapter = {
  isRecording: boolean;
  uri: string | null;
  prepareToRecordAsync: () => Promise<void>;
  record: () => Promise<void> | void;
  stop: () => Promise<void>;
};

export type VoiceCaptureResult = {
  uri: string;
  durationMs: number;
};

export type VoiceCapturePermissions = {
  request: () => Promise<{ granted: boolean }>;
  setAudioMode: () => Promise<void>;
};

export class VoiceCaptureSession {
  private gen = 0;
  private startedAt = 0;
  private live = false;
  private stopped = true;

  constructor(
    private readonly getRecorder: () => VoiceRecorderAdapter,
    private readonly clock: () => number = () => Date.now(),
    private readonly minDurationMs = DEFAULT_MIN_VOICE_MS,
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

  async safeStop(): Promise<void> {
    if (this.stopped) return;
    const recorder = this.getRecorder();
    try {
      let recording = false;
      try {
        recording = recorder.isRecording;
      } catch {
        this.stopped = true;
        return;
      }
      if (recording) {
        await recorder.stop();
      }
      this.stopped = true;
    } catch {
      this.stopped = true;
    }
  }

  async start(permissions: VoiceCapturePermissions): Promise<{ ok: true } | { ok: false; error: string }> {
    const gen = ++this.gen;
    const { granted } = await permissions.request();
    if (gen !== this.gen) return { ok: false, error: "cancelled" };
    if (!granted) {
      return { ok: false, error: "Microphone permission is required for voice messages." };
    }
    await permissions.setAudioMode();
    if (gen !== this.gen) return { ok: false, error: "cancelled" };

    const recorder = this.getRecorder();
    this.stopped = false;
    await recorder.prepareToRecordAsync();
    if (gen !== this.gen) {
      await this.safeStop();
      return { ok: false, error: "cancelled" };
    }
    await recorder.record();
    if (gen !== this.gen) {
      this.live = false;
      await this.safeStop();
      return { ok: false, error: "cancelled" };
    }
    this.live = true;
    this.startedAt = this.clock();
    return { ok: true };
  }

  /**
   * Stop and return a capture if long enough; otherwise null (too short / no uri).
   * Clears live state either way.
   */
  async finish(): Promise<VoiceCaptureResult | null> {
    const durationMs = this.clock() - this.startedAt;
    this.live = false;
    await this.safeStop();
    const uri = this.getRecorder().uri;
    if (!uri || durationMs < this.minDurationMs) return null;
    return { uri, durationMs };
  }

  async discard(): Promise<void> {
    this.live = false;
    this.gen += 1;
    await this.safeStop();
  }
}
