import { useFocusEffect } from "@react-navigation/native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioRecorder,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { DualIconCrossfade } from "@/components/dual-icon-crossfade";
import { ErrorHandlerButton } from "@/components/error-handler-button";
import {
  HoldRecordControls,
  LOCK_DRAG_PX,
  type HoldRecordControlsHandle,
} from "@/components/hold-record-controls";
import { RecordingSlideMeter } from "@/components/recording-slide-meter";
import { ScreenTopAccent } from "@/components/screen-top-accent";
import { ThemedText } from "@/components/themed-text";
import {
  VIDEO_RECORD_MAX_MS,
  VideoMessage,
  type VideoMessageHandle,
} from "@/components/video-message";
import {
  VIDEO_BUBBLE_PLAY_SCALE,
  VIDEO_BUBBLE_SIZE,
  VideoMessageBubble,
} from "@/components/video-message-bubble";
import { VoiceMessageBubble } from "@/components/voice-message-bubble";
import {
  useInputStore,
  type ComposerMode as StoreComposerMode,
} from "@/stores/input-store";
import { useMessagesStore, type Message } from "@/stores/messages-store";
import { useRecordingStore } from "@/stores/recording-store";
import { useColors, useThemeStore } from "@/stores/theme-store";
const MIN_RECORD_MS = 1000;
const HOLD_MS = 320;
const TAP_MAX_MS = 260;
const KEYBOARD_EXTRA_OFFSET = 100;
/** Swipe FAB left by this distance (px) then release to cancel recording. */
const FAB_CANCEL_DRAG_PX = 100;

/** Min row height when a video bubble is scaled up during playback (avoids clip / layout jump). */
const VIDEO_BUBBLE_PLAYING_MIN_HEIGHT = Math.max(
  160,
  Math.ceil(VIDEO_BUBBLE_SIZE * VIDEO_BUBBLE_PLAY_SCALE) + 28,
);

type ComposerMode = StoreComposerMode;

function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0
    ? `${m}:${r.toString().padStart(2, "0")}`
    : `0:${r.toString().padStart(2, "0")}`;
}

type ComposerFabProps = {
  isSendOnly: boolean;
  composerMode: ComposerMode;
  onSendText: () => void;
  onCycleSendEmpty: () => void;
  fabColor: string;
  iconColor: string;
};

function ComposerFab({
  isSendOnly,
  composerMode,
  onSendText,
  onCycleSendEmpty,
  fabColor,
  iconColor,
}: ComposerFabProps) {
  if (isSendOnly) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send message"
        style={[styles.actionFab, { backgroundColor: fabColor }]}
        onPress={onSendText}
      >
        <DualIconCrossfade active="send" size={22} color={iconColor} />
      </Pressable>
    );
  }

  if (composerMode === "send") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Switch to voice message"
        style={[styles.actionFab, { backgroundColor: fabColor }]}
        onPress={onCycleSendEmpty}
      >
        <DualIconCrossfade active="send" size={22} color={iconColor} />
      </Pressable>
    );
  }

  return null;
}

export default function ChatRoomScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const chatId = id || "default";

  const [composerError, setComposerError] = useState<string | null>(null);
  const [videoSessionActive, setVideoSessionActive] = useState(false);
  const [voiceRecordingActive, setVoiceRecordingActive] = useState(false);

  const initializeMockMessages = useMessagesStore(
    (state) => state.initializeMockMessages,
  );
  const getMessagesForChat = useMessagesStore(
    (state) => state.getMessagesForChat,
  );
  const addMessage = useMessagesStore((state) => state.addMessage);
  const activePlaybackId = useMessagesStore((state) => state.activePlaybackId);
  const setActivePlayback = useMessagesStore(
    (state) => state.setActivePlayback,
  );

  const draft = useInputStore((state) => state.getDraft(chatId));
  const setDraft = useInputStore((state) => state.setDraft);
  const clearDraft = useInputStore((state) => state.clearDraft);
  const composerMode = useInputStore((state) => state.getComposerMode(chatId));
  const setComposerMode = useInputStore((state) => state.setComposerMode);
  const cycleComposerMode = useInputStore((state) => state.cycleComposerMode);
  const messages = getMessagesForChat(chatId);
  const [voiceLocked, setVoiceLocked] = useState(false);
  const [videoLocked, setVideoLocked] = useState(false);
  const [videoRecordingActive, setVideoRecordingActive] = useState(false);
  const recordingLive = voiceRecordingActive || videoRecordingActive;
  const [dragY, setDragY] = useState(0);
  const [recordHudTick, setRecordHudTick] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);
  const holdRecordControlsRef = useRef<HoldRecordControlsHandle>(null);
  const slideCancelFabX = useSharedValue(0);
  const shellW = useSharedValue(260);
  const sweep = useSharedValue(0);
  const neonVisible = useSharedValue(0);

  const router = useRouter();
  const colors = useColors();
  const mode = useThemeStore((state) => state.mode);
  const isDark = mode === "dark";
  const contactName = useMemo(() => name || "Chat", [name]);

  const swipeBackGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!recordingLive)
        .activeOffsetX(-14)
        .failOffsetY([-40, 40])
        .onEnd((e) => {
          if (e.translationX < -88) {
            runOnJS(router.back)();
          }
        }),
    [router, recordingLive],
  );

  useEffect(() => {
    initializeMockMessages(chatId);
  }, [chatId, initializeMockMessages]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!inputFocused) {
      cancelAnimation(sweep);
      cancelAnimation(neonVisible);
      sweep.value = 0;
      neonVisible.value = 0;
      return;
    }
    neonVisible.value = 1;
    sweep.value = 0;
    sweep.value = withTiming(
      1,
      { duration: 480, easing: Easing.out(Easing.cubic) },
      (finished) => {
        "worklet";
        if (finished) {
          neonVisible.value = withTiming(0, { duration: 200 });
        }
      },
    );
  }, [inputFocused, sweep, neonVisible]);

  const neonBarStyle = useAnimatedStyle(() => {
    const barW = Math.max(28, shellW.value * 0.34);
    return {
      position: "absolute" as const,
      top: 0,
      left: 0,
      height: 3,
      width: barW,
      borderRadius: 2,
      opacity: neonVisible.value,
      backgroundColor: colors.accentGlow,
      shadowColor: colors.accentGlow,
      shadowOpacity: 0.9,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
      transform: [
        {
          translateX: interpolate(
            sweep.value,
            [0, 1],
            [-barW, Math.max(0, shellW.value)],
          ),
        },
      ],
    };
  }, [colors.accentGlow, neonVisible, shellW, sweep]);

  const onInputShellLayout = useCallback(
    (e: LayoutChangeEvent) => {
      shellW.value = e.nativeEvent.layout.width;
    },
    [shellW],
  );

  const videoRef = useRef<VideoMessageHandle>(null);
  const videoRecordingActiveRef = useRef(false);
  const voiceLockedRef = useRef(false);

  useEffect(() => {
    videoRecordingActiveRef.current = videoRecordingActive;
  }, [videoRecordingActive]);

  useEffect(() => {
    voiceLockedRef.current = voiceLocked;
  }, [voiceLocked]);

  const videoLockedRef = useRef(false);
  useEffect(() => {
    videoLockedRef.current = videoLocked;
  }, [videoLocked]);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const audioRecorderRef = useRef<AudioRecorder>(audioRecorder);
  audioRecorderRef.current = audioRecorder;

  const voiceRecordingLiveRef = useRef(false);
  const voiceRecordStartedAt = useRef(0);
  const videoRecordStartedAt = useRef(0);
  const videoStartGenRef = useRef(0);
  const voiceStartGenRef = useRef(0);
  const voiceRecorderStoppedRef = useRef(false);
  const pressDownAt = useRef(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True after the hold threshold fired (user held long enough to attempt capture). */
  const holdArmedRef = useRef(false);
  /** True once native recording has actually started. */
  const recordingLiveRef = useRef(false);
  const composerModeRef = useRef<ComposerMode>(composerMode);
  composerModeRef.current = composerMode;

  const dismissError = useCallback(() => setComposerError(null), []);

  const resetComposerAfterSend = useCallback(() => {
    holdRecordControlsRef.current?.resetLayout();
    setComposerMode(chatId, "send");
    setDragY(0);
    setVoiceLocked(false);
    setVideoLocked(false);
    setVoiceRecordingActive(false);
    setVideoRecordingActive(false);
    videoRecordingActiveRef.current = false;
    holdArmedRef.current = false;
    recordingLiveRef.current = false;
    voiceRecordingLiveRef.current = false;
    useRecordingStore.getState().cancelRecording();
  }, [chatId, setComposerMode]);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const safeStopVoiceRecording = useCallback(async () => {
    if (voiceRecorderStoppedRef.current) return;
    const recorder = audioRecorderRef.current;
    try {
      let recording = false;
      try {
        recording = recorder.isRecording;
      } catch {
        voiceRecorderStoppedRef.current = true;
        return;
      }
      if (recording) {
        await recorder.stop();
      }
      voiceRecorderStoppedRef.current = true;
    } catch {
      voiceRecorderStoppedRef.current = true;
    }
  }, []);

  const videoSessionActiveRef = useRef(false);
  videoSessionActiveRef.current = videoSessionActive;

  useFocusEffect(
    useCallback(() => {
      return () => {
        voiceStartGenRef.current += 1;
        clearHoldTimer();
        useRecordingStore.getState().cancelRecording();
        if (voiceRecordingLiveRef.current) {
          voiceRecordingLiveRef.current = false;
          void safeStopVoiceRecording();
        }
      };
    }, [clearHoldTimer, safeStopVoiceRecording]),
  );

  useEffect(() => {
    return () => {
      clearHoldTimer();
      useRecordingStore.getState().cancelRecording();
      voiceStartGenRef.current += 1;
      if (videoSessionActiveRef.current) {
        void Promise.resolve(videoRef.current?.stopRecording()).catch(() => {});
      }
    };
  }, [clearHoldTimer]);

  const prevMessageCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  const appendMessage = useCallback(
    (row: {
      kind: "text" | "voice" | "video";
      text?: string;
      durationMs?: number;
      mediaUri?: string;
      sender: string;
      id?: string;
      time?: string;
    }) => {
      addMessage(chatId, {
        id: row.id ?? `${Date.now()}`,
        chatId,
        time: row.time ?? "Now",
        kind: row.kind,
        text: row.text,
        durationMs: row.durationMs,
        mediaUri: row.mediaUri,
        sender: row.sender,
        isMine: row.sender === "me",
      });
    },
    [chatId, addMessage],
  );

  const sendTextMessage = useCallback(() => {
    const trimmedMessage = draft.trim();
    if (!trimmedMessage) return;
    appendMessage({
      kind: "text",
      text: trimmedMessage,
      sender: "me",
    });
    clearDraft(chatId);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [appendMessage, draft, chatId, clearDraft]);

  const finishVoiceCapture = useCallback(async () => {
    if (!voiceRecordingLiveRef.current) return;
    voiceRecordingLiveRef.current = false;
    const recorder = audioRecorderRef.current;
    try {
      await safeStopVoiceRecording();
      const uri = recorder.uri;
      const st = recorder.getStatus();
      const dur =
        st.durationMillis > 0
          ? st.durationMillis
          : Date.now() - voiceRecordStartedAt.current;
      if (dur < MIN_RECORD_MS) {
        setComposerError("Hold to record audio. Tap to change.");
        return;
      }
      if (uri) {
        const payload = {
          kind: "voice" as const,
          mediaUri: uri,
          durationMs: dur,
          sender: "me" as const,
          text: `Voice message ┬╖ ${formatDuration(dur)}`,
        };
        appendMessage(payload);
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        resetComposerAfterSend();
      }
    } catch {
      setComposerError("Could not save the voice message.");
    } finally {
      setVoiceRecordingActive(false);
      setVoiceLocked(false);
      useRecordingStore.getState().stopRecording();
    }
  }, [appendMessage, resetComposerAfterSend, safeStopVoiceRecording]);

  const discardVoiceRecording = useCallback(async () => {
    voiceRecordingLiveRef.current = false;
    useRecordingStore.getState().cancelRecording();
    await safeStopVoiceRecording();
    setVoiceRecordingActive(false);
    setVoiceLocked(false);
    setDragY(0);
    holdRecordControlsRef.current?.resetLayout();
  }, [safeStopVoiceRecording]);

  const onVoiceSlideCancel = useCallback(() => {
    void discardVoiceRecording();
  }, [discardVoiceRecording]);

  const startVoiceRecording = useCallback(async () => {
    const gen = ++voiceStartGenRef.current;
    if (Platform.OS === "web") {
      setComposerError("Voice messages are not available on web.");
      return;
    }
    const { granted } = await requestRecordingPermissionsAsync();
    if (gen !== voiceStartGenRef.current) return;
    if (!granted) {
      setComposerError("Microphone permission is required for voice messages.");
      return;
    }
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,

      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: true,
    });
    if (gen !== voiceStartGenRef.current) return;
    const recorder = audioRecorderRef.current;
    voiceRecorderStoppedRef.current = false;
    await recorder.prepareToRecordAsync();
    if (gen !== voiceStartGenRef.current) {
      await safeStopVoiceRecording();
      return;
    }
    await recorder.record();
    if (gen !== voiceStartGenRef.current) {
      voiceRecordingLiveRef.current = false;
      await safeStopVoiceRecording();
      return;
    }
    voiceRecordingLiveRef.current = true;
    voiceRecordStartedAt.current = Date.now();
    setVoiceLocked(false);
    setVoiceRecordingActive(true);
    useRecordingStore.getState().startRecording(chatId);
  }, [chatId, safeStopVoiceRecording]);

  const finishVideoCapture = useCallback(async () => {
    videoStartGenRef.current += 1;
    setVideoSessionActive(false);
    setVideoLocked(false);
    setVideoRecordingActive(false);
    videoRecordingActiveRef.current = false;
    try {
      const file = await videoRef.current?.stopRecording();
      const dur = Date.now() - videoRecordStartedAt.current;
      if (dur < MIN_RECORD_MS || !file?.uri) {
        setComposerError("Hold longer to record a video message.");
        return;
      }
      const payload = {
        kind: "video" as const,
        mediaUri: file.uri,
        durationMs: dur,
        sender: "me" as const,
        // text: "Video message",
      };
      appendMessage(payload);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetComposerAfterSend();
    } catch {
      setComposerError("Could not save the video message.");
    } finally {
      useRecordingStore.getState().stopRecording();
    }
  }, [appendMessage, resetComposerAfterSend]);

  const discardVideoRecording = useCallback(async () => {
    videoStartGenRef.current += 1;
    useRecordingStore.getState().cancelRecording();
    try {
      await videoRef.current?.stopRecording();
    } catch {
      /* noop */
    }
    setVideoSessionActive(false);
    setVideoLocked(false);
    setVideoRecordingActive(false);
    videoRecordingActiveRef.current = false;
    setDragY(0);
    holdRecordControlsRef.current?.resetLayout();
  }, []);

  const startVideoRecording = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web") {
      setComposerError("Video messages are not available on web.");
      return false;
    }
    const gen = ++videoStartGenRef.current;
    setVideoSessionActive(true);
    setVideoLocked(false);
    await new Promise((r) => setTimeout(r, 160));
    if (gen !== videoStartGenRef.current) return false;
    try {
      const ok = await videoRef.current?.ensurePermissions();
      if (gen !== videoStartGenRef.current) return false;
      if (!ok) {
        setVideoSessionActive(false);
        setComposerError(
          "Camera and microphone permission are required for video messages.",
        );
        return false;
      }
      await videoRef.current?.startRecording();
      if (gen !== videoStartGenRef.current) {
        try {
          await videoRef.current?.stopRecording();
        } catch {
          /* noop */
        }
        return false;
      }
      videoRecordStartedAt.current = Date.now();
      return true;
    } catch {
      if (gen === videoStartGenRef.current) {
        setVideoSessionActive(false);
        setComposerError("Could not start the camera.");
      }
      return false;
    }
  }, []);

  const onVideoSlideCancel = useCallback(() => {
    void discardVideoRecording();
  }, [discardVideoRecording]);

  useEffect(() => {
    if (!recordingLive) return;
    const id = setInterval(() => {
      setRecordHudTick((n) => n + 1);
      const ms = voiceRecordingActive
        ? Date.now() - voiceRecordStartedAt.current
        : videoRecordingActive
          ? Date.now() - videoRecordStartedAt.current
          : 0;
      useRecordingStore.getState().updateRecordingTime(ms);
    }, 200);
    return () => clearInterval(id);
  }, [recordingLive, voiceRecordingActive, videoRecordingActive]);

  useEffect(() => {
    if (!videoRecordingActive) return;
    const id = setTimeout(() => {
      if (videoRecordingActiveRef.current) {
        void finishVideoCapture();
      }
    }, VIDEO_RECORD_MAX_MS);
    return () => clearTimeout(id);
  }, [videoRecordingActive, finishVideoCapture]);

  const lockFromDrag = useCallback((dy: number) => {
    if (dy >= -LOCK_DRAG_PX || !recordingLiveRef.current) return;
    const mode = composerModeRef.current;
    if (mode === "voice" && !voiceLockedRef.current) {
      setVoiceLocked(true);
      useRecordingStore.getState().lockRecording();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (mode === "video" && !videoLockedRef.current) {
      setVideoLocked(true);
      useRecordingStore.getState().lockRecording();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  const onComposerPressOut = useCallback(async () => {
    clearHoldTimer();
    const elapsed = Date.now() - pressDownAt.current;
    const mode = composerModeRef.current;

    if (mode === "voice" && voiceRecordingLiveRef.current) {
      if (voiceLockedRef.current) {
        holdArmedRef.current = false;
        return;
      }
      holdArmedRef.current = false;
      recordingLiveRef.current = false;
      await finishVoiceCapture();
      return;
    }

    if (
      mode === "video" &&
      videoSessionActive &&
      videoRecordingActiveRef.current
    ) {
      if (videoLockedRef.current) {
        holdArmedRef.current = false;
        return;
      }
      holdArmedRef.current = false;
      recordingLiveRef.current = false;
      await finishVideoCapture();
      return;
    }

    if (holdArmedRef.current && !recordingLiveRef.current) {
      holdArmedRef.current = false;
      voiceStartGenRef.current += 1;
      videoStartGenRef.current += 1;
      setVideoSessionActive(false);
      try {
        await videoRef.current?.stopRecording();
      } catch {
        /* noop */
      }
      voiceRecordingLiveRef.current = false;
      await safeStopVoiceRecording();
      return;
    }

    if (elapsed <= TAP_MAX_MS) {
      if (mode === "voice") {
        setComposerMode(chatId, "video");
      } else if (mode === "video") {
        setComposerMode(chatId, "send");
      }
    }
  }, [
    clearHoldTimer,
    finishVoiceCapture,
    finishVideoCapture,
    safeStopVoiceRecording,
    videoSessionActive,
  ]);

  const recordPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => {
          const mode = composerModeRef.current;
          return mode === "voice" || mode === "video";
        },
        onMoveShouldSetPanResponder: () =>
          recordingLiveRef.current || holdArmedRef.current,
        onPanResponderGrant: () => {
          slideCancelFabX.value = 0;
          if (voiceLockedRef.current || videoLockedRef.current) return;
          pressDownAt.current = Date.now();
          holdArmedRef.current = false;
          recordingLiveRef.current = false;
          setDragY(0);
          clearHoldTimer();
          holdTimerRef.current = setTimeout(async () => {
            holdTimerRef.current = null;
            holdArmedRef.current = true;
            const mode = composerModeRef.current;
            try {
              if (mode === "voice") {
                await startVoiceRecording();
                recordingLiveRef.current = true;
              } else if (mode === "video") {
                const ok = await startVideoRecording();
                if (ok) {
                  recordingLiveRef.current = true;
                  setVideoRecordingActive(true);
                  videoRecordingActiveRef.current = true;
                  useRecordingStore.getState().startRecording(chatId);
                }
              }
            } catch {
              holdArmedRef.current = false;
              recordingLiveRef.current = false;
              setVideoSessionActive(false);
              setComposerError("Recording could not start.");
            }
          }, HOLD_MS);
        },
        onPanResponderMove: (_, g) => {
          if (voiceLockedRef.current || videoLockedRef.current) return;
          if (!recordingLiveRef.current && !holdArmedRef.current) return;
          setDragY(g.dy);
          lockFromDrag(g.dy);
          if (
            recordingLiveRef.current &&
            !voiceLockedRef.current &&
            !videoLockedRef.current
          ) {
            slideCancelFabX.value = Math.max(
              -FAB_CANCEL_DRAG_PX * 1.25,
              Math.min(0, g.dx),
            );
          }
        },
        onPanResponderRelease: () => {
          const dx = slideCancelFabX.value;
          const shouldSlideCancel =
            recordingLiveRef.current &&
            !voiceLockedRef.current &&
            !videoLockedRef.current &&
            dx <= -FAB_CANCEL_DRAG_PX;
          slideCancelFabX.value = withSpring(0, {
            damping: 22,
            stiffness: 320,
          });
          setDragY(0);
          if (shouldSlideCancel) {
            const mode = composerModeRef.current;
            if (mode === "voice") {
              void discardVoiceRecording();
            } else if (mode === "video") {
              void discardVideoRecording();
            }
            return;
          }
          void onComposerPressOut();
        },
        onPanResponderTerminate: () => {
          const dx = slideCancelFabX.value;
          const shouldSlideCancel =
            recordingLiveRef.current &&
            !voiceLockedRef.current &&
            !videoLockedRef.current &&
            dx <= -FAB_CANCEL_DRAG_PX;
          slideCancelFabX.value = withSpring(0, {
            damping: 22,
            stiffness: 320,
          });
          setDragY(0);
          if (shouldSlideCancel) {
            const mode = composerModeRef.current;
            if (mode === "voice") {
              void discardVoiceRecording();
            } else if (mode === "video") {
              void discardVideoRecording();
            }
            return;
          }
          void onComposerPressOut();
        },
      }),
    [
      chatId,
      clearHoldTimer,
      discardVideoRecording,
      discardVoiceRecording,
      lockFromDrag,
      slideCancelFabX,
      startVideoRecording,
      startVoiceRecording,
      onComposerPressOut,
    ],
  );

  const recordElapsedMs = useMemo(() => {
    if (voiceRecordingActive) {
      return Date.now() - voiceRecordStartedAt.current + recordHudTick * 0;
    }
    if (videoRecordingActive) {
      return Date.now() - videoRecordStartedAt.current + recordHudTick * 0;
    }
    return 0;
  }, [voiceRecordingActive, videoRecordingActive, recordHudTick]);

  const showVoiceRecordingMeter =
    voiceRecordingActive && composerMode === "voice";

  const showVideoRecordingMeter =
    Platform.OS !== "web" && videoRecordingActive && composerMode === "video";

  const isSendOnly = draft.trim().length > 0;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={["bottom"]}
    >
      <GestureDetector gesture={swipeBackGesture}>
        <View style={styles.gestureFill}>
          <ScreenTopAccent />
          <KeyboardAvoidingView
            style={styles.keyboardRoot}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={
              Platform.OS === "ios" ? 100 : KEYBOARD_EXTRA_OFFSET
            }
          >
            <View style={styles.container}>
              <Stack.Screen
                options={{
                  title: contactName,
                  headerBackTitle: "Chats",
                  headerStyle: { backgroundColor: colors.surfaceElevated },
                  headerTintColor: colors.text,
                  headerShadowVisible: false,
                }}
              />

              {Platform.OS !== "web" && videoSessionActive ? (
                <VideoMessage
                  ref={videoRef}
                  active={videoSessionActive}
                  elapsedMs={recordElapsedMs}
                />
              ) : null}

              <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.messageList}
                keyboardShouldPersistTaps="handled"
                windowSize={9}
                maxToRenderPerBatch={12}
                initialNumToRender={14}
                removeClippedSubviews={Platform.OS === "android"}
                renderItem={({ item }) => {
                  const isMyVideo =
                    item.kind === "video" && item.sender === "me";
                  const isMyVoice =
                    item.kind === "voice" && item.sender === "me";
                  const isMediaBubble =
                    item.kind === "video" || item.kind === "voice";
                  const bubbleBg = isMediaBubble
                    ? "transparent"
                    : item.sender === "me"
                      ? colors.primary
                      : colors.surfaceElevated;
                  const primaryColor =
                    item.sender === "me" && !isMediaBubble
                      ? colors.onPrimary
                      : colors.text;
                  const timeColor = isMyVideo
                    ? isDark
                      ? "rgba(148,163,184,0.95)"
                      : "rgba(71,85,105,0.9)"
                    : isMyVoice
                      ? "rgba(203,213,225,0.75)"
                      : item.sender === "me"
                        ? "rgba(255,255,255,0.7)"
                        : "rgba(0,0,0,0.5)";

                  return (
                    <View
                      style={[
                        styles.messageBubble,
                        item.sender === "me"
                          ? styles.myMessage
                          : styles.theirMessage,
                        isMyVideo && styles.myVideoBubble,
                        item.kind === "video" && styles.videoMessageBubble,
                        isMyVoice && styles.myVoiceBubble,
                        {
                          backgroundColor: bubbleBg,
                          borderWidth:
                            item.sender === "me" || isMediaBubble ? 0 : 1,
                          borderColor: colors.surfaceBorder,
                        },
                      ]}
                    >
                      {item.kind === "voice" && item.mediaUri ? (
                        <VoiceMessageBubble
                          uri={item.mediaUri}
                          seed={item.id}
                          durationMs={item.durationMs}
                          isMine={item.isMine ?? item.sender === "me"}
                          isActive={activePlaybackId === item.id}
                          onActivate={() => {
                            setActivePlayback(item.id);
                          }}
                          onDeactivate={() => {
                            if (activePlaybackId === item.id) {
                              setActivePlayback(null);
                            }
                          }}
                        />
                      ) : null}
                      {item.kind === "video" && item.mediaUri ? (
                        <View
                          style={[
                            styles.videoBubbleWrap,
                            activePlaybackId === item.id &&
                              styles.videoBubbleWrapPlaying,
                          ]}
                        >
                          <VideoMessageBubble
                            uri={item.mediaUri}
                            isMine={item.sender === "me"}
                            durationMs={item.durationMs}
                            isActive={activePlaybackId === item.id}
                            onActivate={() => {
                              setActivePlayback(item.id);
                            }}
                            onDeactivate={() => {
                              if (activePlaybackId === item.id) {
                                setActivePlayback(null);
                              }
                            }}
                          />
                        </View>
                      ) : null}
                      {item.kind === "text" ? (
                        <ThemedText style={{ color: primaryColor }}>
                          {item.text}
                        </ThemedText>
                      ) : item.kind === "video" ? (
                        <ThemedText
                          style={[styles.videoLabel, { color: timeColor }]}
                        >
                          {/* Video message */}
                        </ThemedText>
                      ) : null}
                      <ThemedText
                        style={[styles.timeText, { color: timeColor }]}
                      >
                        {item.time}
                      </ThemedText>
                    </View>
                  );
                }}
              />

              <View
                style={[
                  styles.composerShell,
                  {
                    borderTopColor: colors.surfaceBorder,
                    backgroundColor: colors.surfaceElevated,
                  },
                ]}
              >
                <ErrorHandlerButton
                  message={composerError}
                  onDismiss={dismissError}
                />
                <View style={styles.inputRow}>
                  <View
                    style={[
                      styles.inputShell,
                      {
                        borderColor: colors.inputBorder,
                        backgroundColor: colors.inputFill,
                      },
                    ]}
                    onLayout={onInputShellLayout}
                  >
                    {showVoiceRecordingMeter ? (
                      <RecordingSlideMeter
                        variant="voice"
                        locked={voiceLocked}
                        elapsedMs={recordElapsedMs}
                        onSlideCancel={onVoiceSlideCancel}
                      />
                    ) : showVideoRecordingMeter ? (
                      <RecordingSlideMeter
                        variant="video"
                        locked={videoLocked}
                        elapsedMs={recordElapsedMs}
                        onSlideCancel={onVideoSlideCancel}
                      />
                    ) : (
                      <>
                        {inputFocused ? (
                          <View pointerEvents="auto" style={styles.neonClip}>
                            <Animated.View style={neonBarStyle} />
                          </View>
                        ) : null}
                        <TextInput
                          ref={inputRef}
                          style={[
                            styles.input,
                            {
                              color: colors.text,
                            },
                          ]}
                          placeholder="Type a message..."
                          placeholderTextColor={colors.textMuted}
                          value={draft}
                          onChangeText={(text) => setDraft(chatId, text)}
                          onFocus={() => setInputFocused(true)}
                          onBlur={() => setInputFocused(false)}
                        />
                      </>
                    )}
                  </View>
                  <View style={styles.actionSlot}>
                    {isSendOnly || composerMode === "send" ? (
                      <ComposerFab
                        isSendOnly={isSendOnly}
                        composerMode={composerMode}
                        onSendText={sendTextMessage}
                        onCycleSendEmpty={() =>
                          setComposerMode(chatId, "voice")
                        }
                        fabColor={colors.primary}
                        iconColor={colors.onPrimary}
                      />
                    ) : (
                      <HoldRecordControls
                        ref={holdRecordControlsRef}
                        mode={composerMode}
                        recording={recordingLive}
                        accentColor={colors.primary}
                        iconColor={colors.onPrimary}
                        locked={
                          composerMode === "voice" ? voiceLocked : videoLocked
                        }
                        dragY={dragY}
                        elapsedMs={recordElapsedMs}
                        hideFloatingTimer={
                          showVoiceRecordingMeter || showVideoRecordingMeter
                        }
                        maxDurationMs={
                          composerMode === "video" && recordingLive
                            ? VIDEO_RECORD_MAX_MS
                            : undefined
                        }
                        panHandlers={
                          (composerMode === "voice" ? voiceLocked : videoLocked)
                            ? {}
                            : recordPanResponder.panHandlers
                        }
                        onSendLocked={() => {
                          if (composerMode === "voice") {
                            void finishVoiceCapture();
                          } else {
                            void finishVideoCapture();
                          }
                        }}
                        slideFabX={slideCancelFabX}
                      />
                    )}
                  </View>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </GestureDetector>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardRoot: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  messageList: {
    padding: 16,
    gap: 12,
  },
  myVideoBubble: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 6,
    overflow: "visible",
  },
  videoMessageBubble: {
    overflow: "visible",
  },
  myVoiceBubble: {
    paddingHorizontal: 2,
    paddingTop: 2,
    paddingBottom: 4,
    backgroundColor: "transparent",
    overflow: "visible",
  },
  videoLabel: {
    fontSize: 0,
    marginTop: 1,
  },
  messageBubble: {
    padding: 4,
    borderRadius: 10,
    maxWidth: "80%",
  },
  myMessage: {
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  theirMessage: {
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
  },
  timeText: {
    fontSize: 10,
    alignSelf: "flex-end",
    marginTop: 4,
  },
  videoBubbleWrap: {
    marginBottom: 12,
    alignItems: "center",
    backgroundColor: "transparent",
    overflow: "visible",
    minHeight: VIDEO_BUBBLE_SIZE + 16,
  },
  videoBubbleWrapPlaying: {
    minHeight: VIDEO_BUBBLE_PLAYING_MIN_HEIGHT,
    marginVertical: 40,
  },
  composerShell: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    zIndex: 14,
    elevation: 14,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    position: "relative",
    backgroundColor: "transparent",
  },
  inputShell: {
    flex: 1,
    marginRight: 52,
    minHeight: 44,
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 22,
    overflow: "hidden",
    position: "relative",
  },
  neonClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    overflow: "hidden",
    zIndex: 1,
    pointerEvents: "box-none",
  },
  input: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "transparent",
    minHeight: 40,
    zIndex: 2,
  },
  actionSlot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    zIndex: 16,
    elevation: 16,
  },
  actionFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  gestureFill: {
    flex: 1,
  },
});
