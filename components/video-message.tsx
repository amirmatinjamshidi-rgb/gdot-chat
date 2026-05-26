import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from "expo-camera";

import { CircularProgressRing } from "@/components/circular-progress-ring";

export const VIDEO_RECORD_MAX_MS = 90_000;
const CIRCLE = 220;
const READY_TIMEOUT_MS = 8000;

export type VideoMessageHandle = {
  ensurePermissions: () => Promise<boolean>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<{ uri: string } | null>;
};

type VideoMessageProps = {
  active: boolean;
  elapsedMs?: number;
};

type CameraViewRef = React.ComponentRef<typeof CameraView>;

function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export const VideoMessage = forwardRef<VideoMessageHandle, VideoMessageProps>(
  function VideoMessage({ active, elapsedMs = 0 }, ref) {
    const cameraRef = useRef<CameraViewRef>(null);
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();
    const permissionsRequestedRef = useRef(false);
    const [cameraReady, setCameraReady] = useState(false);
    const recordingPromiseRef = useRef<Promise<
      { uri: string } | undefined
    > | null>(null);
    const recordingActiveRef = useRef(false);
    const readyResolverRef = useRef<(() => void) | null>(null);
    const readyRejectRef = useRef<((reason?: unknown) => void) | null>(null);

    useEffect(() => {
      if (!active) {
        setCameraReady(false);
        readyRejectRef.current?.(new Error("camera session ended"));
        readyRejectRef.current = null;
        readyResolverRef.current = null;
      }
    }, [active]);

    const waitForCameraReady = useCallback(() => {
      if (cameraReady) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        readyResolverRef.current = () => {
          readyResolverRef.current = null;
          readyRejectRef.current = null;
          resolve();
        };
        readyRejectRef.current = (reason) => {
          readyResolverRef.current = null;
          readyRejectRef.current = null;
          reject(reason ?? new Error("camera not ready"));
        };
        setTimeout(() => {
          if (readyRejectRef.current) {
            readyRejectRef.current(new Error("camera ready timeout"));
          }
        }, READY_TIMEOUT_MS);
      });
    }, [cameraReady]);

    const ensurePermissions = useCallback(async () => {
      if (!permissionsRequestedRef.current) {
        permissionsRequestedRef.current = true;
      }
      let cam = cameraPermission?.granted === true;
      let mic = micPermission?.granted === true;
      if (!cam) {
        const r = await requestCameraPermission();
        cam = r.granted;
      }
      if (!mic) {
        const r = await requestMicPermission();
        mic = r.granted;
      }
      return cam && mic;
    }, [
      cameraPermission?.granted,
      micPermission?.granted,
      requestCameraPermission,
      requestMicPermission,
    ]);

    useImperativeHandle(
      ref,
      () => ({
        ensurePermissions,
        async startRecording() {
          if (recordingActiveRef.current) return;
          const ok = await ensurePermissions();
          if (!ok) return;
          await waitForCameraReady();
          const cam = cameraRef.current;
          if (!cam || !active) return;
          recordingActiveRef.current = true;
          const p = cam.recordAsync({
            maxDuration: Math.ceil(VIDEO_RECORD_MAX_MS / 1000),
          });
          recordingPromiseRef.current = p;
        },
        async stopRecording() {
          if (!recordingActiveRef.current && !recordingPromiseRef.current) {
            return null;
          }
          recordingActiveRef.current = false;
          try {
            cameraRef.current?.stopRecording();
          } catch {
            /* noop */
          }
          const p = recordingPromiseRef.current;
          recordingPromiseRef.current = null;
          if (!p) return null;
          try {
            const result = await p;
            return result?.uri ? { uri: result.uri } : null;
          } catch {
            return null;
          }
        },
      }),
      [active, ensurePermissions, waitForCameraReady],
    );

    const onCameraReady = useCallback(() => {
      setCameraReady(true);
      readyResolverRef.current?.();
    }, []);

    if (!active) return null;

    const recordProgress = Math.min(1, elapsedMs / VIDEO_RECORD_MAX_MS);
    const ringSize = CIRCLE + 14;

    return (
      <View style={styles.overlayContent} pointerEvents="box-none">
        <View style={styles.circularPanel}>
          <View style={styles.centerStack}>
            <View style={styles.ringWrap}>
              <CircularProgressRing
                size={ringSize}
                stroke={5}
                progress={recordProgress}
                fillColor="#c4f542"
                trackColor="rgba(255,255,255,0.2)"
              />
              <View style={styles.ring}>
                {!cameraReady ? (
                  <ActivityIndicator
                    color="#fff"
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
                <CameraView
                  ref={cameraRef}
                  style={styles.camera}
                  facing="front"
                  mode="video"
                  mirror
                  onCameraReady={onCameraReady}
                />
              </View>
            </View>
            <Text style={styles.timer}>
              {formatDuration(elapsedMs)} /{" "}
              {formatDuration(VIDEO_RECORD_MAX_MS)}
            </Text>
          </View>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  overlayContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "box-none",
    zIndex: 10,
    elevation: 10,
  },
  circularPanel: {
    width: CIRCLE + 96,
    height: CIRCLE + 96,
    borderRadius: (CIRCLE + 96) / 2,
    backgroundColor: "rgba(15,23,42,0.88)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  centerStack: {
    alignItems: "center",
    gap: 12,
  },
  ringWrap: {
    width: CIRCLE + 14,
    height: CIRCLE + 14,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#c4f542",
    backgroundColor: "#000",
  },
  camera: {
    width: CIRCLE,
    height: CIRCLE,
  },
  timer: {
    color: "#f8fafc",
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
});
