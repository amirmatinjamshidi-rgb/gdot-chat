import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Modal, StyleSheet } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from "expo-camera";

const CIRCLE = 220;

export type VideoMessageHandle = {
  /** Requests camera + microphone once; returns whether both are granted. */
  ensurePermissions: () => Promise<boolean>;
  /** Starts a circular video-note recording (call after camera is active). */
  startRecording: () => Promise<void>;
  /** Stops recording and resolves when the file is ready. */
  stopRecording: () => Promise<{ uri: string } | null>;
};

type VideoMessageProps = {
  /** When true, shows the Telegram-style circular preview while recording. */
  active: boolean;
};

type CameraViewRef = InstanceType<typeof CameraView>;

/**
 * Circular (video note) camera session using expo-camera.
 * Permissions are requested the first time {@link VideoMessageHandle.ensurePermissions} runs.
 */
export const VideoMessage = forwardRef<VideoMessageHandle, VideoMessageProps>(
  function VideoMessage({ active }, ref) {
    const cameraRef = useRef<CameraViewRef>(null);
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();
    const permissionsRequestedRef = useRef(false);
    const [cameraReady, setCameraReady] = useState(false);
    const recordingPromiseRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
    const readyResolverRef = useRef<(() => void) | null>(null);

    useEffect(() => {
      if (!active) {
        setCameraReady(false);
        readyResolverRef.current?.();
        readyResolverRef.current = null;
      }
    }, [active]);

    const waitForCameraReady = useCallback(() => {
      if (cameraReady) return Promise.resolve();
      return new Promise<void>((resolve) => {
        readyResolverRef.current = () => {
          readyResolverRef.current = null;
          resolve();
        };
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
          const ok = await ensurePermissions();
          if (!ok) return;
          await waitForCameraReady();
          const cam = cameraRef.current;
          if (!cam) return;
          const p = cam.recordAsync({ maxDuration: 120 });
          recordingPromiseRef.current = p;
        },
        async stopRecording() {
          cameraRef.current?.stopRecording();
          const p = recordingPromiseRef.current;
          recordingPromiseRef.current = null;
          if (!p) return null;
          const result = await p;
          return result?.uri ? { uri: result.uri } : null;
        },
      }),
      [ensurePermissions, waitForCameraReady],
    );

    const onCameraReady = useCallback(() => {
      setCameraReady(true);
      readyResolverRef.current?.();
    }, []);

    return (
      <Modal visible={active} transparent animationType="none">
        {active ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
            <Animated.View entering={ZoomIn.springify()} style={styles.ring}>
              {!cameraReady ? (
                <ActivityIndicator color="#fff" style={StyleSheet.absoluteFill} />
              ) : null}
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="front"
                mode="video"
                mirror
                onCameraReady={onCameraReady}
              />
            </Animated.View>
          </Animated.View>
        ) : null}
      </Modal>
    );
  },
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    overflow: "hidden",
    borderWidth: 4,
    borderColor: "#c4f542",
    backgroundColor: "#000",
  },
  camera: {
    width: CIRCLE,
    height: CIRCLE,
  },
});
