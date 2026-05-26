import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioRecorder,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
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
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorHandlerButton } from "@/components/error-handler-button";
import {
  HoldRecordControls,
  LOCK_DRAG_PX,
} from "@/components/hold-record-controls";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  VideoMessage,
  VIDEO_RECORD_MAX_MS,
  type VideoMessageHandle,
} from "@/components/video-message";
import { VoiceMessageBubble } from "@/components/voice-message-bubble";
import { VideoMessageBubble } from "@/components/video-message-bubble";
import { useColorScheme } from "@/hooks/use-color-scheme";

const LIME = "#C4F542";
const MIN_RECORD_MS = 1000;
const HOLD_MS = 320;
const TAP_MAX_MS = 260;

type ComposerMode = "send" | "voice" | "video";

type MessageRow = {
  id: string;
  sender: string;
  time: string;
  kind: "text" | "voice" | "video";
  text?: string;
  durationMs?: number;
  mediaUri?: string;
};

const MOCK_MESSAGES: MessageRow[] = [
  { id: "1", text: "Hey Alice!", sender: "me", time: "10:30 AM", kind: "text" },
  {
    id: "2",
    text: "Hi! How is the project going?",
    sender: "Alice",
    time: "10:31 AM",
    kind: "text",
  },
  {
    id: "3",
    text: "It is going great! Just setting up the routes.",
    sender: "me",
    time: "10:32 AM",
    kind: "text",
  },
];

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
};

function ComposerFab({
  isSendOnly,
  composerMode,
  onSendText,
  onCycleSendEmpty,
}: ComposerFabProps) {
  const fabScale = useSharedValue(1);
  const sig = `${isSendOnly}:${composerMode}`;
  const prevSig = useRef(sig);

  useEffect(() => {
    if (prevSig.current === sig) return;
    prevSig.current = sig;
    fabScale.value = withSequence(
      withTiming(1.1, { duration: 95 }),
      withSpring(1, { damping: 14, stiffness: 280 }),
    );
  }, [fabScale, sig]);

  const fabAnim = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

  if (isSendOnly) {
    return (
      <Animated.View style={fabAnim}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          style={styles.actionFab}
          onPress={onSendText}
        >
          <IconSymbol name="paperplane.fill" size={22} color="#fff" />
        </Pressable>
      </Animated.View>
    );
  }

  if (composerMode === "send") {
    return (
      <Animated.View style={fabAnim}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch to voice message"
          style={styles.actionFab}
          onPress={onCycleSendEmpty}
        >
          <IconSymbol name="paperplane.fill" size={22} color="#fff" />
        </Pressable>
      </Animated.View>
    );
  }

  return null;
}

export default function ChatRoomScreen() {
  const { name } = useLocalSearchParams<{ id: string; name: string }>();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<MessageRow[]>(MOCK_MESSAGES);
  const [composerMode, setComposerMode] = useState<ComposerMode>("send");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [videoSessionActive, setVideoSessionActive] = useState(false);
  const [voiceRecordingActive, setVoiceRecordingActive] = useState(false);
  const [voiceLocked, setVoiceLocked] = useState(false);
  const [videoLocked, setVideoLocked] = useState(false);
  const [videoRecordingActive, setVideoRecordingActive] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [recordHudTick, setRecordHudTick] = useState(0);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const listRef = useRef<FlatList<MessageRow>>(null);
  const inputRef = useRef<TextInput>(null);
  const shellW = useSharedValue(260);
  const sweep = useSharedValue(0);
  const neonVisible = useSharedValue(0);

  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";
  const contactName = useMemo(() => name || "Chat", [name]);

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
    // Show the bar, then do two fast passes and fade it out completely.
    neonVisible.value = 1;
    sweep.value = 0;
    sweep.value = withSequence(
      withTiming(1, { duration: 525 }),
      withTiming(0, { duration: 0 }),
      withTiming(1, { duration: 350 }),
      withTiming(0, { duration: 50 }, (finished) => {
        "worklet";
        if (finished) {
          neonVisible.value = withTiming(0, { duration: 180 });
        }
      }),
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
      backgroundColor: "#5cf9e8",
      shadowColor: "#39f6ff",
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
  });

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
    setComposerMode("send");
    setDragY(0);
    setVoiceLocked(false);
    setVideoLocked(false);
    setVoiceRecordingActive(false);
    setVideoRecordingActive(false);
    videoRecordingActiveRef.current = false;
    holdArmedRef.current = false;
    recordingLiveRef.current = false;
    voiceRecordingLiveRef.current = false;
  }, []);

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
    (row: Omit<MessageRow, "id" | "time"> & { id?: string; time?: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: row.id ?? `${Date.now()}`,
          time: row.time ?? "Now",
          ...row,
        },
      ]);
    },
    [],
  );

  const sendTextMessage = useCallback(() => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;
    appendMessage({
      kind: "text",
      text: trimmedMessage,
      sender: "me",
    });
    setMessage("");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [appendMessage, message]);

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
        appendMessage({
          kind: "voice",
          mediaUri: uri,
          durationMs: dur,
          sender: "me",
          text: `Voice message · ${formatDuration(dur)}`,
        });
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
    }
  }, [appendMessage, resetComposerAfterSend, safeStopVoiceRecording]);

  const discardVoiceRecording = useCallback(async () => {
    voiceRecordingLiveRef.current = false;
    await safeStopVoiceRecording();
    setVoiceRecordingActive(false);
    setVoiceLocked(false);
  }, [safeStopVoiceRecording]);

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
  }, [safeStopVoiceRecording]);

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
      appendMessage({
        kind: "video",
        mediaUri: file.uri,
        durationMs: dur,
        sender: "me",
        text: "Video message",
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetComposerAfterSend();
    } catch {
      setComposerError("Could not save the video message.");
    }
  }, [appendMessage, resetComposerAfterSend]);

  const discardVideoRecording = useCallback(async () => {
    videoStartGenRef.current += 1;
    try {
      await videoRef.current?.stopRecording();
    } catch {
      /* noop */
    }
    setVideoSessionActive(false);
    setVideoLocked(false);
    setVideoRecordingActive(false);
    videoRecordingActiveRef.current = false;
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

  const recordingLive = voiceRecordingActive || videoRecordingActive;

  useEffect(() => {
    if (!recordingLive) return;
    const id = setInterval(() => setRecordHudTick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [recordingLive]);

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
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (mode === "video" && !videoLockedRef.current) {
      setVideoLocked(true);
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
        setComposerMode("video");
      } else if (mode === "video") {
        setComposerMode("send");
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
          return (
            mode === "voice" || mode === "video"
          );
        },
        onMoveShouldSetPanResponder: () =>
          recordingLiveRef.current || holdArmedRef.current,
        onPanResponderGrant: () => {
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
        },
        onPanResponderRelease: () => {
          setDragY(0);
          void onComposerPressOut();
        },
        onPanResponderTerminate: () => {
          setDragY(0);
          void onComposerPressOut();
        },
      }),
    [
      clearHoldTimer,
      lockFromDrag,
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

  const isSendOnly = message.trim().length > 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ThemedView style={styles.container}>
        <Stack.Screen
          options={{ title: contactName, headerBackTitle: "Chats" }}
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
            const isMyVideo = item.kind === "video" && item.sender === "me";
            const isMyVoice = item.kind === "voice" && item.sender === "me";
            const isMediaBubble = item.kind === "video" || item.kind === "voice";
            const bubbleBg = isMediaBubble
              ? "transparent"
              : item.sender === "me"
                ? "#3B82F6"
                : isDark
                  ? "#374151"
                  : "#E5E7EB";
            const primaryColor =
              item.sender === "me" && !isMediaBubble
                ? "white"
                : isDark
                  ? "white"
                  : "black";
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
                  item.sender === "me" ? styles.myMessage : styles.theirMessage,
                  isMyVideo && styles.myVideoBubble,
                  item.kind === "video" && styles.videoMessageBubble,
                  isMyVoice && styles.myVoiceBubble,
                  { backgroundColor: bubbleBg },
                ]}
              >
                {item.kind === "voice" && item.mediaUri ? (
                  <VoiceMessageBubble
                    uri={item.mediaUri}
                    seed={item.id}
                    durationMs={item.durationMs}
                    isMine={item.sender === "me"}
                    isActive={playingVoiceId === item.id}
                    onActivate={() => {
                      setPlayingVoiceId(item.id);
                      if (playingVideoId) setPlayingVideoId(null);
                    }}
                    onDeactivate={() =>
                      setPlayingVoiceId((cur) =>
                        cur === item.id ? null : cur,
                      )
                    }
                  />
                ) : null}
                {item.kind === "video" && item.mediaUri ? (
                  <View
                    style={[
                      styles.videoBubbleWrap,
                      playingVideoId === item.id && styles.videoBubbleWrapPlaying,
                    ]}
                  >
                    <VideoMessageBubble
                      uri={item.mediaUri}
                      isMine={item.sender === "me"}
                      durationMs={item.durationMs}
                      isActive={playingVideoId === item.id}
                      onActivate={() => {
                        setPlayingVideoId(item.id);
                        if (playingVoiceId) setPlayingVoiceId(null);
                      }}
                      onDeactivate={() =>
                        setPlayingVideoId((cur) =>
                          cur === item.id ? null : cur,
                        )
                      }
                    />
                  </View>
                ) : null}
                {item.kind === "text" ? (
                  <ThemedText style={{ color: primaryColor }}>
                    {item.text}
                  </ThemedText>
                ) : item.kind === "video" ? (
                  <ThemedText style={[styles.videoLabel, { color: timeColor }]}>
                    Video message
                  </ThemedText>
                ) : null}
                <ThemedText style={[styles.timeText, { color: timeColor }]}>
                  {item.time}
                </ThemedText>
              </View>
            );
          }}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
          <View
            style={[
              styles.composerShell,
              { borderTopColor: isDark ? "#374151" : "#E5E7EB" },
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
                    borderColor: isDark ? "#4b5563" : "#cbd5e1",
                  },
                ]}
                onLayout={onInputShellLayout}
              >
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
                      color: isDark ? "white" : "black",
                    },
                  ]}
                  placeholder="Type a message..."
                  placeholderTextColor={isDark ? "#9CA3AF" : "#6B7280"}
                  value={message}
                  onChangeText={setMessage}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                />
              </View>
              <View style={styles.actionSlot}>
                {isSendOnly || composerMode === "send" ? (
                  <ComposerFab
                    isSendOnly={isSendOnly}
                    composerMode={composerMode}
                    onSendText={sendTextMessage}
                    onCycleSendEmpty={() => setComposerMode("voice")}
                  />
                ) : (
                  <HoldRecordControls
                    mode={composerMode}
                    recording={recordingLive}
                    locked={
                      composerMode === "voice" ? voiceLocked : videoLocked
                    }
                    dragY={dragY}
                    elapsedMs={recordElapsedMs}
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
                    onCancelLocked={() => {
                      if (composerMode === "voice") {
                        void discardVoiceRecording();
                      } else {
                        void discardVideoRecording();
                      }
                    }}
                  />
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
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
    fontSize: 12,
    marginTop: 2,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 18,
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
    marginBottom: 8,
    alignItems: "center",
    backgroundColor: "transparent",
    overflow: "visible",
    minHeight: 170,
  },
  videoBubbleWrapPlaying: {
    minHeight: 260,
    marginVertical: 16,
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
    backgroundColor: LIME,
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
});
