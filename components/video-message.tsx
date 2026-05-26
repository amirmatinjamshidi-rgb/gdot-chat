import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from "expo-camera";

const CIRCLE = 160;
const READY_TIMEOUT_MS = 8000;

export type VideoMessageHandle = {
  ensurePermissions: () => Promise<boolean>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<{ uri: string } | null>;
};

type VideoMessageProps = {
  active: boolean;
};

type CameraViewRef = React.ComponentRef<typeof CameraView>;

export const VideoMessage = forwardRef<VideoMessageHandle, VideoMessageProps>(
  function VideoMessage({ active }, ref) {
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
          const p = cam.recordAsync({ maxDuration: 120 });
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

    return (
      <View style={styles.wrap}>
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
    );
  },
);

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    marginBottom: 10,
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
});
