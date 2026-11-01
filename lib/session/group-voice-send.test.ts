import { describe, expect, it } from "vitest";
import { VoiceCaptureSession } from "@/lib/media/voice-capture";

/**
 * E2E-shaped unit: voice capture finish feeds sendGroupOutgoingMedia args.
 */
describe("group voice send wiring", () => {
  it("maps capture result into sendGroupOutgoingMedia payload", async () => {
    let now = 10_000;
    const recorder = {
      isRecording: false,
      uri: null as string | null,
      prepareToRecordAsync: async () => undefined,
      record: async () => {
        recorder.isRecording = true;
        recorder.uri = "file:///group-voice.m4a";
      },
      stop: async () => {
        recorder.isRecording = false;
      },
    };
    const session = new VoiceCaptureSession(() => recorder, () => now, 500);
    await session.start({
      request: async () => ({ granted: true }),
      setAudioMode: async () => undefined,
    });
    now += 1200;
    const capture = await session.finish();
    expect(capture).toEqual({
      uri: "file:///group-voice.m4a",
      durationMs: 1200,
    });

    const calls: unknown[] = [];
    const sendGroupOutgoingMedia = async (
      groupId: string,
      input: {
        uri: string;
        kind: "voice";
        mimeType: string;
        durationMs: number;
      },
    ) => {
      calls.push([groupId, input]);
    };
    const groupId = crypto.randomUUID();
    await sendGroupOutgoingMedia(groupId, {
      uri: capture!.uri,
      kind: "voice",
      mimeType: "audio/mp4",
      durationMs: capture!.durationMs,
    });
    expect(calls).toEqual([
      [
        groupId,
        {
          uri: "file:///group-voice.m4a",
          kind: "voice",
          mimeType: "audio/mp4",
          durationMs: 1200,
        },
      ],
    ]);
  });
});
