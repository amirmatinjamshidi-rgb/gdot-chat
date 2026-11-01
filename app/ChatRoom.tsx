import { useFocusEffect } from "@react-navigation/native";
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
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatMessageRow } from "@/components/chat/chat-message-row";
import { ComposerFab } from "@/components/composer-fab";
import { ErrorHandlerButton } from "@/components/error-handler-button";
import {
  HoldRecordControls,
  LOCK_DRAG_PX,
  type HoldRecordControlsHandle,
} from "@/components/hold-record-controls";
import { RecordingSlideMeter } from "@/components/recording-slide-meter";
import { ReactionPicker } from "@/components/reactions/reaction-picker";
import { ScreenTopAccent } from "@/components/screen-top-accent";
import { ThemedText } from "@/components/themed-text";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { VideoMessage, type VideoMessageHandle } from "@/components/video-message";
import { useComposerDraft } from "@/hooks/use-composer-draft";
import { useConversationMessages } from "@/hooks/use-conversation-messages";
import { useReactions } from "@/hooks/use-reactions";
import { useSwipeBackGesture } from "@/hooks/use-swipe-back";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { localMessageToUi } from "@/lib/chat/local-message-ui";
import { VIDEO_RECORD_MAX_MS, VOICE_RECORD_MAX_MS } from "@/lib/config";
import {
  assertMessageTextWithinLimit,
  MAX_MESSAGE_TEXT_CHARS,
  MESSAGE_TOO_LONG_ERROR,
} from "@/lib/protocol/message-limits";
import { useAppServices } from "@/lib/services/app-services-context";
import {
  useInputStore,
  type ComposerMode as StoreComposerMode,
} from "@/stores/input-store";
import { useMessagesStore } from "@/stores/messages-store";
import { useRecordingStore } from "@/stores/recording-store";
import { useColors } from "@/stores/theme-store";
const MIN_RECORD_MS = 1000;
const HOLD_MS = 320;
const TAP_MAX_MS = 260;
const KEYBOARD_EXTRA_OFFSET = 100;
/** Swipe FAB left by this distance (px) then release to cancel recording. */
const FAB_CANCEL_DRAG_PX = 100;

type ComposerMode = StoreComposerMode;

export default function ChatRoomScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const chatId = id || "default";

  const [composerError, setComposerError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [videoSessionActive, setVideoSessionActive] = useState(false);

  const { syncService, conversationStore, mediaTransfer, signalService } =
    useAppServices();
  const activePlaybackId = useMessagesStore((state) => state.activePlaybackId);
  const setActivePlayback = useMessagesStore(
    (state) => state.setActivePlayback,
  );

  const { draft, setDraft, clearDraft } = useComposerDraft(chatId);
  const composerMode = useInputStore(
    (state) => state.composerModesByChatId[chatId] ?? "send",
  );
  const setComposerMode = useInputStore((state) => state.setComposerMode);
  const cycleComposerMode = useInputStore((state) => state.cycleComposerMode);
  const [videoLocked, setVideoLocked] = useState(false);
  const [videoRecordingActive, setVideoRecordingActive] = useState(false);
  const sendVoiceMediaRef = useRef<
    (result: { uri: string; durationMs: number }) => Promise<void>
  >(async () => undefined);

  const voice = useVoiceRecorder({
    conversationId: chatId || "chat",
    maxDurationMs: VOICE_RECORD_MAX_MS,
    onMaxDuration: (r) => {
      void sendVoiceMediaRef.current(r);
    },
    onError: (m) => setComposerError(m),
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const voiceRecordingActive = voice.isRecording;
  const voiceLocked = voice.isLocked;

  const recordingLive = voiceRecordingActive || videoRecordingActive;
  const [dragY, setDragY] = useState(0);
  const [recordHudTick, setRecordHudTick] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const holdRecordControlsRef = useRef<HoldRecordControlsHandle>(null);
  const slideCancelFabX = useSharedValue(0);
  const shellW = useSharedValue(260);
  const sweep = useSharedValue(0);
  const neonVisible = useSharedValue(0);

  const router = useRouter();
  const colors = useColors();
  const contactName = useMemo(() => name || "Chat", [name]);
  const {
    messages: localMessages,
    attachments,
    reload: reloadMessages,
  } = useConversationMessages(chatId);
  const { reactionsByMessageId, sendReaction, currentUserId } = useReactions({
    conversationId: chatId,
  });
  const [peerDeviceId, setPeerDeviceId] = useState("");
  const [peerUserId, setPeerUserId] = useState("");
  const [identityKeyChanged, setIdentityKeyChanged] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState({ x: 0, y: 0 });
  const [pickerMessageId, setPickerMessageId] = useState<string | null>(null);
  const [highlightEmoji, setHighlightEmoji] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const conv = await conversationStore.getById(chatId);
      if (!conv) return;
      setPeerDeviceId(conv.peerDeviceId);
      setPeerUserId(conv.peerUserId);
      const trust = await signalService.getIdentityTrust(conv.peerUserId);
      setIdentityKeyChanged(trust.keyChanged);
    })();
  }, [chatId, conversationStore, signalService]);


  const acceptIdentityKey = useCallback(async () => {
    if (!peerUserId) return;
    await signalService.acceptNewIdentityKey(peerUserId);
    await syncService.retryIdentityQuarantine(peerUserId);
    setIdentityKeyChanged(false);
  }, [peerUserId, signalService]);

  useFocusEffect(
    useCallback(() => {
      if (!peerUserId) return;
      void (async () => {
        const trust = await signalService.getIdentityTrust(peerUserId);
        setIdentityKeyChanged(trust.keyChanged);
      })();
    }, [peerUserId, signalService]),
  );


  const openSafetyNumber = useCallback(() => {
    if (!peerUserId || !peerDeviceId) return;
    router.push({
      pathname: "/safety-number",
      params: { peerUserId, peerDeviceId },
    });
  }, [peerDeviceId, peerUserId, router]);

  const messages = useMemo(
    () =>
      localMessages.map((m) =>
        localMessageToUi(
          m,
          contactName,
          reactionsByMessageId[m.id] ?? [],
          m.attachmentId ? attachments[m.attachmentId] : undefined,
        ),
      ),
    [localMessages, attachments, contactName, reactionsByMessageId],
  );

  const handleMessageLongPress = useCallback(
    (messageId: string, layout: { x: number; y: number }) => {
      setPickerMessageId(messageId);
      setPickerAnchor(layout);
      setPickerVisible(true);
    },
    [],
  );

  const handleReactionPress = useCallback(
    (messageId: string, emoji: string) => {
      if (!peerDeviceId) return;
      const msg = messages.find((m) => m.id === messageId);
      setHighlightEmoji(emoji);
      void sendReaction(
        messageId,
        emoji,
        peerDeviceId,
        msg?.serverEnvelopeId,
      );
      setTimeout(() => setHighlightEmoji(null), 500);
    },
    [messages, peerDeviceId, sendReaction],
  );

  const swipeBackGesture = useSwipeBackGesture(!recordingLive);

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

  const voiceRecordingLiveRef = useRef(false);
  const videoRecordStartedAt = useRef(0);
  const videoStartGenRef = useRef(0);
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
    setVideoLocked(false);
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

  const videoSessionActiveRef = useRef(false);
  videoSessionActiveRef.current = videoSessionActive;

  useFocusEffect(
    useCallback(() => {
      return () => {
        clearHoldTimer();
        useRecordingStore.getState().cancelRecording();
        if (voiceRecordingLiveRef.current) {
          voiceRecordingLiveRef.current = false;
          void voiceRef.current.discard();
        }
      };
    }, [clearHoldTimer]),
  );

  useEffect(() => {
    return () => {
      clearHoldTimer();
      useRecordingStore.getState().cancelRecording();
      videoStartGenRef.current += 1;
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

  const sendTextMessage = useCallback(() => {
    const trimmedMessage = draft.trim();
    if (!trimmedMessage || isSending) return;
    void (async () => {
      setIsSending(true);
      try {
        if (identityKeyChanged) {
          setComposerError("Cannot send until you accept the new safety number.");
          return;
        }
        try {
          assertMessageTextWithinLimit(trimmedMessage);
        } catch {
          setComposerError(MESSAGE_TOO_LONG_ERROR);
          return;
        }
        await syncService.sendOutgoing(chatId, trimmedMessage);
        clearDraft();
        resetComposerAfterSend();
        await reloadMessages();
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {
        setComposerError(
          e instanceof Error ? e.message : "Failed to send message.",
        );
      } finally {
        setIsSending(false);
      }
    })();
  }, [
    draft,
    chatId,
    clearDraft,
    syncService,
    reloadMessages,
    resetComposerAfterSend,
    isSending,
    identityKeyChanged,
  ]);

  const sendVoiceMedia = useCallback(
    async (result: { uri: string; durationMs: number }) => {
      try {
        if (identityKeyChanged) {
          setComposerError("Cannot send until you accept the new safety number.");
          return;
        }
        await syncService.sendOutgoingMedia(chatId, {
          uri: result.uri,
          kind: "voice",
          mimeType: "audio/mp4",
          durationMs: result.durationMs,
        });
        resetComposerAfterSend();
        await reloadMessages();
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {
        setComposerError(
          e instanceof Error ? e.message : "Failed to send voice message.",
        );
      }
    },
    [
      chatId,
      identityKeyChanged,
      reloadMessages,
      resetComposerAfterSend,
      syncService,
    ],
  );
  sendVoiceMediaRef.current = sendVoiceMedia;

  const finishVoiceCapture = useCallback(async () => {
    voiceRecordingLiveRef.current = false;
    recordingLiveRef.current = false;
    holdArmedRef.current = false;
    const result = await voiceRef.current.finish();
    holdRecordControlsRef.current?.resetLayout();
    setDragY(0);
    if (result) await sendVoiceMedia(result);
    else resetComposerAfterSend();
  }, [resetComposerAfterSend, sendVoiceMedia]);

  const discardVoiceRecording = useCallback(async () => {
    voiceRecordingLiveRef.current = false;
    recordingLiveRef.current = false;
    holdArmedRef.current = false;
    await voiceRef.current.discard();
    setDragY(0);
    holdRecordControlsRef.current?.resetLayout();
    resetComposerAfterSend();
  }, [resetComposerAfterSend]);

  const onVoiceSlideCancel = useCallback(() => {
    void discardVoiceRecording();
  }, [discardVoiceRecording]);

  const startVoiceRecording = useCallback(async (): Promise<boolean> => {
    const ok = await voiceRef.current.start();
    if (ok) {
      voiceRecordingLiveRef.current = true;
      recordingLiveRef.current = true;
    }
    return ok;
  }, []);

  const finishVideoCapture = useCallback(async () => {
    const durationMs = Date.now() - videoRecordStartedAt.current;
    let recorded: { uri: string } | null = null;
    try {
      recorded = (await videoRef.current?.stopRecording()) ?? null;
    } catch {
      recorded = null;
    }
    setVideoSessionActive(false);
    setVideoLocked(false);
    setVideoRecordingActive(false);
    videoRecordingActiveRef.current = false;
    useRecordingStore.getState().stopRecording();
    if (!recorded?.uri || durationMs < MIN_RECORD_MS) {
      resetComposerAfterSend();
      return;
    }
    try {
      if (identityKeyChanged) {
        setComposerError("Cannot send until you accept the new safety number.");
        return;
      }
      await syncService.sendOutgoingMedia(chatId, {
        uri: recorded.uri,
        kind: "video",
        mimeType: "video/mp4",
        durationMs,
      });
      resetComposerAfterSend();
      await reloadMessages();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      setComposerError(
        e instanceof Error ? e.message : "Failed to send video message.",
      );
    }
  }, [chatId, reloadMessages, resetComposerAfterSend, syncService, identityKeyChanged]);

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
        ? voiceRef.current.elapsedMs
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
    if (mode === "voice" && !voiceRef.current.isLocked) {
      voiceRef.current.lock();
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
      videoStartGenRef.current += 1;
      setVideoSessionActive(false);
      try {
        await videoRef.current?.stopRecording();
      } catch {
        /* noop */
      }
      voiceRecordingLiveRef.current = false;
      await voiceRef.current.discard();
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
    videoSessionActive,
    chatId,
    setComposerMode,
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
      void recordHudTick;
      return voice.elapsedMs;
    }
    if (videoRecordingActive) {
      return Date.now() - videoRecordStartedAt.current + recordHudTick * 0;
    }
    return 0;
  }, [voiceRecordingActive, videoRecordingActive, recordHudTick]);

  const showVoiceRecordingMeter = voiceRecordingActive;
  const showVideoRecordingMeter = videoRecordingActive && !voiceRecordingActive;

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

              {identityKeyChanged ? (
                <View
                  style={{
                    marginHorizontal: 12,
                    marginBottom: 8,
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: "rgba(217,119,6,0.15)",
                    gap: 8,
                  }}
                >
                  <ThemedText style={{ color: colors.text, fontWeight: "600" }}>
                    Safety number changed
                  </ThemedText>
                  <ThemedText style={{ color: colors.text, opacity: 0.85 }}>
                    This contact&apos;s identity key changed. Sending is blocked
                    until you verify or accept the new key.
                  </ThemedText>
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    <ScalePressable
                      onPress={openSafetyNumber}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: colors.primary,
                      }}
                    >
                      <ThemedText style={{ color: colors.onPrimary, fontWeight: "600" }}>
                        View safety number
                      </ThemedText>
                    </ScalePressable>
                    <ScalePressable
                      onPress={() => void acceptIdentityKey()}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: colors.surfaceElevated,
                      }}
                    >
                      <ThemedText style={{ color: colors.text, fontWeight: "600" }}>
                        Accept new key
                      </ThemedText>
                    </ScalePressable>
                  </View>
                </View>
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
                renderItem={({ item }) => (
                  <ChatMessageRow
                    item={item}
                    currentUserId={currentUserId}
                    activePlaybackId={activePlaybackId}
                    highlightEmoji={highlightEmoji}
                    pickerMessageId={pickerMessageId}
                    onLongPress={handleMessageLongPress}
                    onReactionPress={handleReactionPress}
                    onActivatePlayback={(mid) => setActivePlayback(mid)}
                    onDeactivatePlayback={(mid) => {
                      if (activePlaybackId === mid) setActivePlayback(null);
                    }}
                    onDownloadMedia={(attachmentId) => {
                      void mediaTransfer
                        .downloadAttachment(attachmentId)
                        .then(() => reloadMessages())
                        .catch((e: unknown) => {
                          setComposerError(
                            e instanceof Error
                              ? e.message
                              : "Download failed.",
                          );
                        });
                    }}
                  />
                )}
              />

              <ReactionPicker
                visible={pickerVisible}
                anchorX={pickerAnchor.x}
                anchorY={pickerAnchor.y}
                onClose={() => setPickerVisible(false)}
                onSelect={(emoji) => {
                  if (pickerMessageId && peerDeviceId) {
                    const msg = messages.find((m) => m.id === pickerMessageId);
                    setHighlightEmoji(emoji);
                    void sendReaction(
                      pickerMessageId,
                      emoji,
                      peerDeviceId,
                      msg?.serverEnvelopeId,
                    );
                    setTimeout(() => setHighlightEmoji(null), 500);
                  }
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
                          maxLength={MAX_MESSAGE_TEXT_CHARS}
                          onChangeText={setDraft}
                          onFocus={() => setInputFocused(true)}
                          onBlur={() => setInputFocused(false)}
                        />
                      </>
                    )}
                  </View>
                  <View style={styles.actionSlot}>
                    {!isSendOnly &&
                    (composerMode === "voice" || composerMode === "video") ? (
                      <HoldRecordControls
                        ref={holdRecordControlsRef}
                        mode={composerMode}
                        recording={recordingLive}
                        locked={
                          composerMode === "voice" ? voiceLocked : videoLocked
                        }
                        dragY={dragY}
                        elapsedMs={recordElapsedMs}
                        maxDurationMs={
                          composerMode === "video"
                            ? VIDEO_RECORD_MAX_MS
                            : VOICE_RECORD_MAX_MS
                        }
                        hideFloatingTimer={
                          showVoiceRecordingMeter || showVideoRecordingMeter
                        }
                        panHandlers={recordPanResponder.panHandlers}
                        onSendLocked={() => {
                          if (composerMode === "voice") {
                            void finishVoiceCapture();
                          } else {
                            void finishVideoCapture();
                          }
                        }}
                        slideFabX={slideCancelFabX}
                        accentColor={colors.primary}
                        iconColor={colors.onPrimary}
                      />
                    ) : (
                      <ComposerFab
                        isSendOnly={isSendOnly}
                        composerMode={composerMode}
                        onSendText={sendTextMessage}
                        onCycleSendEmpty={() => cycleComposerMode(chatId)}
                        fabColor={colors.primary}
                        iconColor={colors.onPrimary}
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
  videoLabel: {
    fontSize: 0,
    marginTop: 1,
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
