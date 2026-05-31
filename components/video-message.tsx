import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn } from "react-native-reanimated";

import { CircularProgressRing } from "@/components/circular-progress-ring";
import { useThemePalette } from "@/providers/theme-palette-provider";

export const VIDEO_RECORD_MAX_MS = 90_000;
/** Visible camera disc */
const CIRCLE = 212;
const RING_INSET = 10;
const ORB_MARGIN = 36;
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
    const { colors } = useThemePalette();
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
    const ringSize = CIRCLE + RING_INSET;
    const orbSize = ringSize + ORB_MARGIN * 2;
    const remainingMs = Math.max(0, VIDEO_RECORD_MAX_MS - elapsedMs);
    const trackRing = `${colors.textMuted}55`;

    return (
      <Animated.View
        entering={FadeIn.duration(280).easing(Easing.out(Easing.cubic))}
        style={styles.overlayContent}
        pointerEvents="box-none"
      >
        <View style={styles.column}>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Swipe up on the button to lock · tap send when done
          </Text>

          <View
            style={[
              styles.orb,
              {
                width: orbSize,
                height: orbSize,
                borderRadius: orbSize,
                backgroundColor: `${colors.surfaceElevated}F0`,
                // borderColor: `${colors.surfaceBorder}CC`,

                shadowColor: colors.text,
              },
            ]}
          >
            <View style={styles.orbInner}>
              <View style={styles.ringWrap}>
                <CircularProgressRing
                  size={ringSize}
                  stroke={4}
                  progress={recordProgress}
                  fillColor={colors.primary}
                  trackColor={trackRing}
                />
                <View
                  style={[
                    styles.cameraDisc,
                    {
                      borderColor: `${colors.primary}CC`,
                      backgroundColor: "#000",
                    },
                  ]}
                >
                  {!cameraReady ? (
                    <ActivityIndicator
                      color={colors.primary}
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
                  <LinearGradient
                    pointerEvents="none"
                    colors={["transparent", "rgba(0,0,0,0.78)"]}
                    locations={[0.35, 1]}
                    style={styles.bottomScrim}
                  />
                  <View style={styles.timerStack} pointerEvents="none">
                    <Text style={styles.timerMain}>
                      {formatDuration(elapsedMs)}
                    </Text>
                    <Text style={styles.timerSub}>
                      {formatDuration(remainingMs)} left
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Animated.View>
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
  column: {
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
  },
  hint: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 16,
    maxWidth: 300,
    letterSpacing: 0.2,
    opacity: 0.92,
  },
  orb: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.12,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
  orbInner: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  ringWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  cameraDisc: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    overflow: "hidden",
    borderWidth: 2.5,
  },
  camera: {
    width: CIRCLE,
    height: CIRCLE,
  },
  bottomScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 88,
    zIndex: 2,
  },
  timerStack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 14,
    alignItems: "center",
    zIndex: 3,
    gap: 2,
  },
  timerMain: {
    fontSize: 20,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    letterSpacing: 0.4,
    color: "#FFFFFF",
  },
  timerSub: {
    fontSize: 11,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    color: "rgba(255,255,255,0.78)",
  },
});
