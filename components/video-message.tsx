import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeInUp, ZoomIn, runOnJS } from "react-native-reanimated";
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from "expo-camera";

const CIRCLE = 220;
const SWIPE_LOCK_PX = 56;

export type VideoMessageHandle = {
  ensurePermissions: () => Promise<boolean>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<{ uri: string } | null>;
};

type VideoMessageProps = {
  active: boolean;
  /** After swipe-up, show send / delete like Telegram. */
  locked: boolean;
  onSwipeToLock: () => void;
  onCancel: () => void;
  onSend: () => void;
};

type CameraViewRef = InstanceType<typeof CameraView>;

export const VideoMessage = forwardRef<VideoMessageHandle, VideoMessageProps>(
  function VideoMessage(
    { active, locked, onSwipeToLock, onCancel, onSend },
    ref,
  ) {
    const cameraRef = useRef<CameraViewRef>(null);
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();
    const permissionsRequestedRef = useRef(false);
    const [cameraReady, setCameraReady] = useState(false);
    const recordingPromiseRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
    const readyResolverRef = useRef<(() => void) | null>(null);
    const lockTriggeredRef = useRef(false);

    useEffect(() => {
      if (!active) {
        setCameraReady(false);
        readyResolverRef.current?.();
        readyResolverRef.current = null;
        lockTriggeredRef.current = false;
      }
    }, [active]);

    useEffect(() => {
      if (!locked) lockTriggeredRef.current = false;
    }, [locked]);

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

    const tryLock = useCallback(() => {
      if (lockTriggeredRef.current) return;
      lockTriggeredRef.current = true;
      onSwipeToLock();
    }, [onSwipeToLock]);

    const panGesture = Gesture.Pan()
      .enabled(active && !locked)
      .onUpdate((e) => {
        "worklet";
        if (e.translationY < -SWIPE_LOCK_PX) {
          runOnJS(tryLock)();
        }
      });

    return (
      <Modal visible={active} transparent animationType="none">
        {active ? (
          <GestureDetector gesture={panGesture}>
            <Animated.View
              entering={FadeIn.duration(200)}
              style={styles.backdrop}
            >
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

              {!locked ? (
                <Animated.View
                  entering={FadeInUp.delay(80).springify()}
                  style={styles.hintPill}
                >
                  <MaterialIcons name="north" size={18} color="#a7f3d0" />
                  <Text style={styles.hintText}>Swipe up to lock</Text>
                </Animated.View>
              ) : null}

              {locked ? (
                <Animated.View
                  entering={FadeInUp.springify()}
                  style={styles.lockedBar}
                >
                  <Pressable
                    style={styles.roundBtn}
                    onPress={onCancel}
                    accessibilityLabel="Delete video message"
                  >
                    <MaterialIcons name="delete" size={26} color="#fff" />
                  </Pressable>
                  <MaterialIcons name="lock" size={22} color="#c4f542" />
                  <Pressable
                    style={[styles.roundBtn, styles.sendBtn]}
                    onPress={onSend}
                    accessibilityLabel="Send video message"
                  >
                    <MaterialIcons name="send" size={24} color="#0f172a" />
                  </Pressable>
                </Animated.View>
              ) : null}
            </Animated.View>
          </GestureDetector>
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
  hintPill: {
    position: "absolute",
    bottom: "22%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.72)",
  },
  hintText: {
    color: "#ecfdf5",
    fontSize: 14,
    fontWeight: "600",
  },
  lockedBar: {
    position: "absolute",
    bottom: 48,
    left: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    backgroundColor: "rgba(15,23,42,0.88)",
    borderWidth: 1,
    borderColor: "rgba(196,245,66,0.35)",
  },
  roundBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(239,68,68,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtn: {
    backgroundColor: "#c4f542",
  },
});
