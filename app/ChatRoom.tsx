import { Audio, ResizeMode, Video } from "expo-av";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams } from "expo-router";
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
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorHandlerButton } from "@/components/error-handler-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  VideoMessage,
  type VideoMessageHandle,
} from "@/components/video-message";
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
  onPressInHold: () => void;
  onPressOutHold: () => void;
};

function ComposerFab({
  isSendOnly,
  composerMode,
  onSendText,
  onCycleSendEmpty,
  onPressInHold,
  onPressOutHold,
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

  const holdIcon =
    composerMode === "voice" ? ("mic.fill" as const) : ("video.fill" as const);

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

  return (
    <Animated.View style={fabAnim}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          composerMode === "voice"
            ? "Voice message hold to record"
            : "Video message hold to record"
        }
        style={styles.actionFab}
        onPressIn={onPressInHold}
        onPressOut={() => {
          void onPressOutHold();
        }}
      >
        <IconSymbol name={holdIcon} size={22} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

export default function ChatRoomScreen() {
  const { name } = useLocalSearchParams<{ id: string; name: string }>();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<MessageRow[]>(MOCK_MESSAGES);
  const [composerMode, setComposerMode] = useState<ComposerMode>("send");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [videoSessionActive, setVideoSessionActive] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const listRef = useRef<FlatList<MessageRow>>(null);
  const inputRef = useRef<TextInput>(null);
  const shellW = useSharedValue(260);
  const sweep = useSharedValue(0);

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
    if (inputFocused) {
      sweep.value = withRepeat(withTiming(1, { duration: 1500 }), -1, false);
    } else {
      cancelAnimation(sweep);
      sweep.value = 0;
    }
  }, [inputFocused, sweep]);

  const neonBarStyle = useAnimatedStyle(() => {
    const barW = Math.max(28, shellW.value * 0.34);
    return {
      position: "absolute" as const,
      top: 0,
      left: 0,
      height: 3,
      width: barW,
      borderRadius: 2,
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
            [-barW * 0.25, Math.max(0, shellW.value - barW * 0.75)],
          ),
        },
      ],
    };
  });

  const onInputShellLayout = useCallback((e: LayoutChangeEvent) => {
    shellW.value = e.nativeEvent.layout.width;
  }, [shellW]);

  const videoRef = useRef<VideoMessageHandle>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const voiceRecordStartedAt = useRef(0);
  const videoRecordStartedAt = useRef(0);
  const pressDownAt = useRef(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True after the hold threshold fired (user held long enough to attempt capture). */
  const holdArmedRef = useRef(false);
  /** True once native recording has actually started. */
  const recordingLiveRef = useRef(false);
  const composerModeRef = useRef<ComposerMode>(composerMode);
  composerModeRef.current = composerMode;

  const dismissError = useCallback(() => setComposerError(null), []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const videoSessionActiveRef = useRef(false);
  videoSessionActiveRef.current = videoSessionActive;

  useEffect(() => {
    return () => {
      clearHoldTimer();
      void (async () => {
        const r = recordingRef.current;
        if (r) {
          try {
            await r.stopAndUnloadAsync();
          } catch {
            /* noop */
          }
          recordingRef.current = null;
        }
        if (videoSessionActiveRef.current) {
          // Imperative ref at unmount; latest handle is required here.
          // eslint-disable-next-line react-hooks/exhaustive-deps -- ref read intentionally at cleanup time
          const videoApi = videoRef.current;
          void videoApi?.stopRecording();
        }
      })();
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
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      const st = await rec.getStatusAsync();
      const dur =
        typeof st.durationMillis === "number"
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
      }
    } catch {
      setComposerError("Could not save the voice message.");
    }
  }, [appendMessage]);

  const startVoiceRecording = useCallback(async () => {
    if (Platform.OS === "web") {
      setComposerError("Voice messages are not available on web.");
      return;
    }
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== "granted") {
      setComposerError("Microphone permission is required for voice messages.");
      return;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    await recording.startAsync();
    recordingRef.current = recording;
    voiceRecordStartedAt.current = Date.now();
  }, []);

  const finishVideoCapture = useCallback(async () => {
    setVideoSessionActive(false);
    try {
      const file = await videoRef.current?.stopRecording();
      const dur = Date.now() - videoRecordStartedAt.current;
      if (dur < MIN_RECORD_MS || !file?.uri) {
        setComposerError("Hold to record audio. Tap to change.");
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
    } catch {
      setComposerError("Could not save the video message.");
    }
  }, [appendMessage]);

  const startVideoRecording = useCallback(async () => {
    if (Platform.OS === "web") {
      setComposerError("Video messages are not available on web.");
      return;
    }
    setVideoSessionActive(true);
    await new Promise((r) => setTimeout(r, 160));
    try {
      const ok = await videoRef.current?.ensurePermissions();
      if (!ok) {
        setVideoSessionActive(false);
        setComposerError(
          "Camera and microphone permission are required for video messages.",
        );
        return;
      }
      await videoRef.current?.startRecording();
      videoRecordStartedAt.current = Date.now();
    } catch {
      setVideoSessionActive(false);
      setComposerError("Could not start the camera.");
    }
  }, []);

  const onComposerPressIn = useCallback(() => {
    if (Platform.OS === "web") return;
    pressDownAt.current = Date.now();
    holdArmedRef.current = false;
    recordingLiveRef.current = false;
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
          await startVideoRecording();
          recordingLiveRef.current = true;
        }
      } catch {
        holdArmedRef.current = false;
        recordingLiveRef.current = false;
        setVideoSessionActive(false);
        setComposerError("Recording could not start.");
      }
    }, HOLD_MS);
  }, [clearHoldTimer, startVideoRecording, startVoiceRecording]);

  const onComposerPressOut = useCallback(async () => {
    clearHoldTimer();
    const down = pressDownAt.current;
    const elapsed = Date.now() - down;
    const mode = composerModeRef.current;

    if (recordingLiveRef.current) {
      recordingLiveRef.current = false;
      holdArmedRef.current = false;
      if (mode === "voice") {
        await finishVoiceCapture();
      } else if (mode === "video") {
        await finishVideoCapture();
      }
      return;
    }

    if (holdArmedRef.current && !recordingLiveRef.current) {
      holdArmedRef.current = false;
      setVideoSessionActive(false);
      try {
        await videoRef.current?.stopRecording();
      } catch {
        /* noop */
      }
      const rec = recordingRef.current;
      recordingRef.current = null;
      if (rec) {
        try {
          await rec.stopAndUnloadAsync();
        } catch {
          /* noop */
        }
      }
      return;
    }

    if (elapsed <= TAP_MAX_MS) {
      if (mode === "voice") {
        setComposerMode("video");
      } else if (mode === "video") {
        setComposerMode("send");
      }
    }
  }, [clearHoldTimer, finishVoiceCapture, finishVideoCapture]);

  const isSendOnly = message.trim().length > 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ThemedView style={styles.container}>
        <Stack.Screen
          options={{ title: contactName, headerBackTitle: "Chats" }}
        />

        {Platform.OS !== "web" ? (
          <VideoMessage ref={videoRef} active={videoSessionActive} />
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
            const bubbleBg = isMyVideo
              ? "transparent"
              : item.sender === "me"
                ? "#3B82F6"
                : isDark
                  ? "#374151"
                  : "#E5E7EB";
            const primaryColor =
              item.sender === "me" && !isMyVideo
                ? "white"
                : isDark
                  ? "white"
                  : "black";
            const timeColor =
              isMyVideo
                ? isDark
                  ? "rgba(148,163,184,0.95)"
                  : "rgba(71,85,105,0.9)"
                : item.sender === "me"
                  ? "rgba(255,255,255,0.7)"
                  : "rgba(0,0,0,0.5)";

            return (
              <View
                style={[
                  styles.messageBubble,
                  item.sender === "me" ? styles.myMessage : styles.theirMessage,
                  isMyVideo && styles.myVideoBubble,
                  { backgroundColor: bubbleBg },
                ]}
              >
                {item.kind === "video" && item.mediaUri ? (
                  <View style={styles.videoBubbleWrap}>
                    <Video
                      source={{ uri: item.mediaUri }}
                      style={[
                        styles.videoCircle,
                        isMyVideo && styles.videoCircleMine,
                      ]}
                      useNativeControls
                      resizeMode={ResizeMode.COVER}
                      isLooping
                    />
                  </View>
                ) : null}
                {item.kind !== "video" ? (
                  <ThemedText style={{ color: primaryColor }}>{item.text}</ThemedText>
                ) : (
                  <ThemedText style={[styles.videoLabel, { color: timeColor }]}>
                    Video message
                  </ThemedText>
                )}
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
                  <View
                    pointerEvents="none"
                    style={styles.neonClip}
                  >
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
                <ComposerFab
                  isSendOnly={isSendOnly}
                  composerMode={composerMode}
                  onSendText={sendTextMessage}
                  onCycleSendEmpty={() => setComposerMode("voice")}
                  onPressInHold={onComposerPressIn}
                  onPressOutHold={onComposerPressOut}
                />
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
  },
  videoCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "transparent",
  },
  videoCircleMine: {
    borderWidth: 2,
    borderColor: "rgba(92,249,232,0.85)",
  },
  composerShell: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
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
    bottom: 2,
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
