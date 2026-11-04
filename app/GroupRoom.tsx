import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import {
  ActivityIndicator,
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
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  cancelAnimation,
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
import { VideoMessage } from "@/components/video-message";
import { useComposerDraft } from "@/hooks/use-composer-draft";
import { useConversationMessages } from "@/hooks/use-conversation-messages";
import { useReactions } from "@/hooks/use-reactions";
import { useSwipeBackGesture } from "@/hooks/use-swipe-back";
import { useVideoRecorder } from "@/hooks/use-video-recorder";
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

const HOLD_MS = 320;
const TAP_MAX_MS = 260;
const KEYBOARD_EXTRA_OFFSET = 100;
const FAB_CANCEL_DRAG_PX = 100;

type ComposerMode = StoreComposerMode;

export default function GroupRoomScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const groupId = id || "";
  const title = name || "Group";

  const { syncService, groupStore, mediaTransfer } = useAppServices();
  const router = useRouter();
  const colors = useColors();

  const [composerError, setComposerError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [recordHudTick, setRecordHudTick] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState({ x: 0, y: 0 });
  const [pickerMessageId, setPickerMessageId] = useState<string | null>(null);
  const [highlightEmoji, setHighlightEmoji] = useState<string | null>(null);
  const [receiptLabels, setReceiptLabels] = useState<
    Record<string, { label: string; info: string }>
  >({});
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(
    null,
  );

  const { draft, setDraft, clearDraft } = useComposerDraft(groupId);
  const composerMode = useInputStore(
    (s) => s.composerModesByChatId[groupId] ?? "send",
  );
  const setComposerMode = useInputStore((s) => s.setComposerMode);
  const cycleComposerMode = useInputStore((s) => s.cycleComposerMode);

  const {
    messages: localMessages,
    attachments,
    reload: reloadMessages,
    loadOlder,
    loadingOlder,
    hasMore,
  } = useConversationMessages(groupId || undefined);

  const { reactionsByMessageId, sendReaction, currentUserId } = useReactions({
    conversationId: groupId || undefined,
    groupId: groupId || undefined,
  });

  const activePlaybackId = useMessagesStore((s) => s.activePlaybackId);
  const setActivePlayback = useMessagesStore((s) => s.setActivePlayback);

  const listRef = useRef<FlashListRef<import("@/stores/messages-store").Message>>(null);
  const holdRecordControlsRef = useRef<HoldRecordControlsHandle>(null);
  const pressDownAt = useRef(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdArmedRef = useRef(false);
  const recordingLiveRef = useRef(false);
  const composerModeRef = useRef<ComposerMode>(composerMode);
  composerModeRef.current = composerMode;

  const slideCancelFabX = useSharedValue(0);
  const shellW = useSharedValue(260);
  const sweep = useSharedValue(0);
  const neonVisible = useSharedValue(0);

  const sendVoiceResult = useCallback(
    async (result: { uri: string; durationMs: number }) => {
      if (!groupId) return;
      try {
        await syncService.sendGroupOutgoingMedia(groupId, {
          uri: result.uri,
          kind: "voice",
          mimeType: "audio/mp4",
          durationMs: result.durationMs,
        });
        clearDraft();
        setComposerMode(groupId, "send");
        await reloadMessages();
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {
        setComposerError(
          e instanceof Error ? e.message : "Failed to send voice message.",
        );
      }
    },
    [groupId, syncService, clearDraft, setComposerMode, reloadMessages],
  );

  const voice = useVoiceRecorder({
    conversationId: groupId || "group",
    maxDurationMs: VOICE_RECORD_MAX_MS,
    onMaxDuration: (r) => {
      void sendVoiceResult(r);
    },
    onError: (m) => setComposerError(m),
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const sendVideoResult = useCallback(
    async (result: { uri: string; durationMs: number }) => {
      if (!groupId) return;
      try {
        await syncService.sendGroupOutgoingMedia(groupId, {
          uri: result.uri,
          kind: "video",
          mimeType: "video/mp4",
          durationMs: result.durationMs,
        });
        holdRecordControlsRef.current?.resetLayout();
        setComposerMode(groupId, "send");
        setDragY(0);
        holdArmedRef.current = false;
        recordingLiveRef.current = false;
        useRecordingStore.getState().cancelRecording();
        await reloadMessages();
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {
        setComposerError(
          e instanceof Error ? e.message : "Failed to send video message.",
        );
      }
    },
    [groupId, syncService, setComposerMode, reloadMessages],
  );

  const video = useVideoRecorder({
    conversationId: groupId || "group",
    maxDurationMs: VIDEO_RECORD_MAX_MS,
    onMaxDuration: (r) => {
      void sendVideoResult(r);
    },
    onError: (m) => setComposerError(m),
  });
  const videoHookRef = useRef(video);
  videoHookRef.current = video;

  const videoRecordingActive = video.isRecording;
  const videoLocked = video.isLocked;
  const videoSessionActive = video.sessionActive;

  const recordingLive = voice.isRecording || videoRecordingActive;
  const swipeBackGesture = useSwipeBackGesture(!recordingLive);

  const messages = useMemo(
    () =>
      localMessages.map((m) =>
        localMessageToUi(
          m,
          m.direction === "outgoing"
            ? "You"
            : m.senderDeviceId === "system"
              ? "System"
              : (m.senderUserId ?? m.senderDeviceId).slice(0, 8),
          reactionsByMessageId[m.id] ?? [],
          m.attachmentId ? attachments[m.attachmentId] : null,
        ),
      ),
    [localMessages, attachments, reactionsByMessageId],
  );

  // Group receipt aggregates for outgoing text
  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, { label: string; info: string }> = {};
      const members = ((await groupStore.listMembers(groupId, true)) ?? []).filter(
        (m) => m.userId !== currentUserId,
      );
      for (const m of localMessages) {
        if (m.direction !== "outgoing" || m.kind !== "text") continue;
        const agg = await syncService.getGroupReceiptAggregate(
          groupId,
          m.clientId,
        );
        if (!agg) continue;
        const deliveredAll =
          members.length > 0 &&
          members.every((mem) => agg.deliveredUserIds.includes(mem.userId));
        const label = deliveredAll
          ? `Delivered to all · Read by ${agg.readUserIds.length}`
          : `Delivered ${agg.deliveredUserIds.length}/${members.length} · Read ${agg.readUserIds.length}`;
        const nameFor = (uid: string) =>
          members.find((mem) => mem.userId === uid)?.username ?? uid.slice(0, 8);
        next[m.id] = {
          label,
          info: [
            agg.deliveredUserIds.length
              ? `Delivered: ${agg.deliveredUserIds.map(nameFor).join(", ")}`
              : "Delivered: —",
            agg.readUserIds.length
              ? `Read: ${agg.readUserIds.map(nameFor).join(", ")}`
              : "Read: —",
          ].join("\n"),
        };
      }
      if (!cancelled) setReceiptLabels(next);

      const unread = localMessages
        .filter(
          (m) =>
            m.direction === "incoming" &&
            m.senderDeviceId !== "system" &&
            m.senderUserId,
        )
        .map((m) => ({
          clientMessageId: m.clientId,
          senderUserId: m.senderUserId!,
          senderDeviceId: m.senderDeviceId,
        }));
      if (unread.length) {
        void syncService.markGroupMessagesRead(groupId, unread);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, localMessages, groupStore, syncService, currentUserId]);

  const prevMessageCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (!inputFocused) {
      cancelAnimation(sweep);
      cancelAnimation(neonVisible);
      neonVisible.value = 0;
      return;
    }
    neonVisible.value = 1;
    sweep.value = 0;
    sweep.value = withTiming(1, { duration: 1600, easing: Easing.linear }, () => {
      neonVisible.value = withTiming(0, { duration: 200 });
    });
  }, [inputFocused, sweep, neonVisible]);

  const neonBarStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: 48,
    transform: [{ translateX: (shellW.value + 48) * sweep.value - 48 }],
    opacity: neonVisible.value,
    backgroundColor: colors.accentGlow ?? colors.tint,
  }));

  const onInputShellLayout = useCallback(
    (e: LayoutChangeEvent) => {
      shellW.value = e.nativeEvent.layout.width;
    },
    [shellW],
  );

  const dismissError = useCallback(() => setComposerError(null), []);

  const resetComposerAfterSend = useCallback(() => {
    holdRecordControlsRef.current?.resetLayout();
    setComposerMode(groupId, "send");
    setDragY(0);
    holdArmedRef.current = false;
    recordingLiveRef.current = false;
    useRecordingStore.getState().cancelRecording();
  }, [groupId, setComposerMode]);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const sendTextMessage = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed || isSending || !groupId) return;
    void (async () => {
      setIsSending(true);
      try {
        try {
          assertMessageTextWithinLimit(trimmed);
        } catch {
          setComposerError(MESSAGE_TOO_LONG_ERROR);
          return;
        }
        await syncService.sendGroupOutgoing(groupId, trimmed);
        clearDraft();
        resetComposerAfterSend();
        await reloadMessages();
        await groupStore.touchPreview(groupId, trimmed.slice(0, 120), Date.now());
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {
        setComposerError(e instanceof Error ? e.message : "Failed to send message.");
      } finally {
        setIsSending(false);
      }
    })();
  }, [
    draft,
    isSending,
    groupId,
    syncService,
    clearDraft,
    resetComposerAfterSend,
    reloadMessages,
    groupStore,
  ]);

  const finishAndSendVoice = useCallback(async () => {
    recordingLiveRef.current = false;
    holdArmedRef.current = false;
    const result = await voiceRef.current.finish();
    holdRecordControlsRef.current?.resetLayout();
    setDragY(0);
    if (result) await sendVoiceResult(result);
    else resetComposerAfterSend();
  }, [sendVoiceResult, resetComposerAfterSend]);

  const discardVoice = useCallback(async () => {
    recordingLiveRef.current = false;
    holdArmedRef.current = false;
    await voiceRef.current.discard();
    holdRecordControlsRef.current?.resetLayout();
    setDragY(0);
    resetComposerAfterSend();
  }, [resetComposerAfterSend]);

  const finishVideoCapture = useCallback(async () => {
    recordingLiveRef.current = false;
    holdArmedRef.current = false;
    const result = await videoHookRef.current.finish();
    holdRecordControlsRef.current?.resetLayout();
    setDragY(0);
    if (result) await sendVideoResult(result);
    else resetComposerAfterSend();
  }, [resetComposerAfterSend, sendVideoResult]);

  const discardVideoRecording = useCallback(async () => {
    recordingLiveRef.current = false;
    holdArmedRef.current = false;
    await videoHookRef.current.discard();
    setDragY(0);
    holdRecordControlsRef.current?.resetLayout();
    resetComposerAfterSend();
  }, [resetComposerAfterSend]);

  const startVideoRecording = useCallback(async (): Promise<boolean> => {
    const ok = await videoHookRef.current.start();
    if (ok) recordingLiveRef.current = true;
    return ok;
  }, []);

  useEffect(() => {
    if (!recordingLive) return;
    const id = setInterval(() => {
      setRecordHudTick((n) => n + 1);
      const ms = voice.isRecording
        ? voice.elapsedMs
        : videoRecordingActive
          ? videoHookRef.current.elapsedMs
          : 0;
      useRecordingStore.getState().updateRecordingTime(ms);
    }, 200);
    return () => clearInterval(id);
  }, [recordingLive, voice.isRecording, voice.elapsedMs, videoRecordingActive]);


  const lockFromDrag = useCallback((dy: number) => {
    if (dy >= -LOCK_DRAG_PX || !recordingLiveRef.current) return;
    const mode = composerModeRef.current;
    if (mode === "voice" && !voiceRef.current.isLocked) {
      voiceRef.current.lock();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (mode === "video" && !videoHookRef.current.isLocked) {
      videoHookRef.current.lock();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  const onComposerPressOut = useCallback(async () => {
    clearHoldTimer();
    const elapsed = Date.now() - pressDownAt.current;
    const mode = composerModeRef.current;

    if (mode === "voice" && voiceRef.current.isRecording) {
      if (voiceRef.current.isLocked) {
        holdArmedRef.current = false;
        return;
      }
      holdArmedRef.current = false;
      recordingLiveRef.current = false;
      await finishAndSendVoice();
      return;
    }

    if (mode === "video" && videoSessionActive && videoHookRef.current.isRecording) {
      if (videoHookRef.current.isLocked) {
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
      await videoHookRef.current.discard();
      await voiceRef.current.discard();
      return;
    }

    if (elapsed <= TAP_MAX_MS) {
      if (mode === "voice") setComposerMode(groupId, "video");
      else if (mode === "video") setComposerMode(groupId, "send");
    }
  }, [
    clearHoldTimer,
    finishAndSendVoice,
    finishVideoCapture,
    videoSessionActive,
    groupId,
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
          if (voiceRef.current.isLocked || videoHookRef.current.isLocked) return;
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
                const ok = await voiceRef.current.start();
                recordingLiveRef.current = ok;
              } else if (mode === "video") {
                const ok = await startVideoRecording();
                recordingLiveRef.current = ok;
              }
            } catch {
              holdArmedRef.current = false;
              recordingLiveRef.current = false;
              void videoHookRef.current.discard();
              setComposerError("Recording could not start.");
            }
          }, HOLD_MS);
        },
        onPanResponderMove: (_, g) => {
          if (voiceRef.current.isLocked || videoHookRef.current.isLocked) return;
          if (!recordingLiveRef.current && !holdArmedRef.current) return;
          setDragY(g.dy);
          lockFromDrag(g.dy);
          if (
            recordingLiveRef.current &&
            !voiceRef.current.isLocked &&
            !videoHookRef.current.isLocked
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
            !voiceRef.current.isLocked &&
            !videoHookRef.current.isLocked &&
            dx <= -FAB_CANCEL_DRAG_PX;
          slideCancelFabX.value = withSpring(0, { damping: 22, stiffness: 320 });
          setDragY(0);
          if (shouldSlideCancel) {
            const mode = composerModeRef.current;
            if (mode === "voice") void discardVoice();
            else if (mode === "video") void discardVideoRecording();
            return;
          }
          void onComposerPressOut();
        },
        onPanResponderTerminate: () => {
          const dx = slideCancelFabX.value;
          const shouldSlideCancel =
            recordingLiveRef.current &&
            !voiceRef.current.isLocked &&
            !videoHookRef.current.isLocked &&
            dx <= -FAB_CANCEL_DRAG_PX;
          slideCancelFabX.value = withSpring(0, { damping: 22, stiffness: 320 });
          setDragY(0);
          if (shouldSlideCancel) {
            const mode = composerModeRef.current;
            if (mode === "voice") void discardVoice();
            else if (mode === "video") void discardVideoRecording();
            return;
          }
          void onComposerPressOut();
        },
      }),
    [
      clearHoldTimer,
      discardVideoRecording,
      discardVoice,
      groupId,
      lockFromDrag,
      onComposerPressOut,
      slideCancelFabX,
      startVideoRecording,
    ],
  );

  const recordElapsedMs = useMemo(() => {
    void recordHudTick;
    if (voice.isRecording) return voice.elapsedMs;
    if (videoRecordingActive) return video.elapsedMs;
    return 0;
  }, [voice.isRecording, voice.elapsedMs, videoRecordingActive, video.elapsedMs, recordHudTick]);

  const isSendOnly = draft.trim().length > 0;

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
      const msg = messages.find((m) => m.id === messageId);
      setHighlightEmoji(emoji);
      void sendReaction(messageId, emoji, "group", msg?.serverEnvelopeId);
      setTimeout(() => setHighlightEmoji(null), 500);
    },
    [messages, sendReaction],
  );

  const onActivatePlayback = useCallback(
    (mid: string) => setActivePlayback(mid),
    [setActivePlayback],
  );
  const onDeactivatePlayback = useCallback((_mid: string) => {
    setActivePlayback(null);
  }, [setActivePlayback]);
  const onDownloadMedia = useCallback(
    (attachmentId: string) => {
      void mediaTransfer
        .downloadAttachment(attachmentId)
        .then(() => reloadMessages())
        .catch((e: unknown) => {
          setComposerError(
            e instanceof Error ? e.message : "Download failed.",
          );
        });
    },
    [mediaTransfer, reloadMessages],
  );
  const onEndReachedOlder = useCallback(() => {
    if (!hasMore || loadingOlder) return;
    void loadOlder();
  }, [hasMore, loadingOlder, loadOlder]);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={["bottom"]}
    >
      <GestureDetector gesture={swipeBackGesture}>
        <View style={styles.gestureFill} testID="group-swipe-root">
          <ScreenTopAccent />
          <KeyboardAvoidingView
            testID="group-keyboard-avoid"
            style={styles.keyboardRoot}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={
              Platform.OS === "ios" ? 100 : KEYBOARD_EXTRA_OFFSET
            }
          >
            <View style={styles.container}>
              <Stack.Screen
                options={{
                  title,
                  headerBackTitle: "Chats",
                  headerStyle: { backgroundColor: colors.surfaceElevated },
                  headerTintColor: colors.text,
                  headerShadowVisible: false,
                  headerRight: () => (
                    <ScalePressable
                      testID="group-info-button"
                      onPress={() =>
                        router.push({
                          pathname: "/GroupInfo" as never,
                          params: { id: groupId, name: title },
                        })
                      }
                    >
                      <ThemedText style={{ color: colors.tint }}>Info</ThemedText>
                    </ScalePressable>
                  ),
                }}
              />

              {Platform.OS !== "web" && videoSessionActive ? (
                <VideoMessage
                  ref={video.videoRef}
                  active={videoSessionActive}
                  elapsedMs={recordElapsedMs}
                />
              ) : null}

              <FlashList
                ref={listRef}
                testID="group-message-list"
                data={messages}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.messageList}
                keyboardShouldPersistTaps="handled"
                maintainVisibleContentPosition={{
                  startRenderingFromBottom: true,
                  autoscrollToBottomThreshold: 40,
                  animateAutoScrollToBottom: true,
                }}
                drawDistance={280}
                onStartReached={onEndReachedOlder}
                onStartReachedThreshold={0.4}
                ListEmptyComponent={
                  <ThemedText style={{ opacity: 0.6, textAlign: "center" }}>
                    No messages yet
                  </ThemedText>
                }
                ListHeaderComponent={
                  loadingOlder ? (
                    <ActivityIndicator style={{ marginVertical: 12 }} />
                  ) : null
                }
                renderItem={({ item }) => {
                  const receipt = receiptLabels[item.id];
                  const isSystem = item.sender === "System";
                  if (isSystem) {
                    return (
                      <ThemedText
                        testID={`group-system-${item.id}`}
                        style={{ textAlign: "center", opacity: 0.6 }}
                      >
                        {item.text}
                      </ThemedText>
                    );
                  }
                  return (
                    <ChatMessageRow
                      item={item}
                      currentUserId={currentUserId}
                      isActive={activePlaybackId === item.id}
                      highlightEmoji={
                        pickerMessageId === item.id ? highlightEmoji : null
                      }
                      onLongPress={handleMessageLongPress}
                      onReactionPress={handleReactionPress}
                      onActivatePlayback={onActivatePlayback}
                      onDeactivatePlayback={onDeactivatePlayback}
                      onDownloadMedia={onDownloadMedia}
                      header={
                        !(item.isMine ?? item.sender === "me") &&
                        item.sender !== "me" &&
                        item.sender !== "System" ? (
                          <ThemedText style={styles.senderLabel}>
                            {item.sender}
                          </ThemedText>
                        ) : null
                      }
                      footer={
                        receipt ? (
                          <View>
                            <ScalePressable
                              testID={`group-receipt-${item.id}`}
                              onPress={() =>
                                setExpandedReceiptId((cur) =>
                                  cur === item.id ? null : item.id,
                                )
                              }
                            >
                              <ThemedText
                                style={{
                                  opacity: 0.6,
                                  fontSize: 12,
                                  marginTop: 4,
                                  alignSelf: item.isMine
                                    ? "flex-end"
                                    : "flex-start",
                                }}
                              >
                                {receipt.label}
                              </ThemedText>
                            </ScalePressable>
                            {expandedReceiptId === item.id ? (
                              <ThemedText
                                testID={`group-receipt-info-${item.id}`}
                                style={{
                                  opacity: 0.55,
                                  fontSize: 11,
                                  marginTop: 4,
                                  alignSelf: item.isMine
                                    ? "flex-end"
                                    : "flex-start",
                                }}
                              >
                                {receipt.info}
                              </ThemedText>
                            ) : null}
                          </View>
                        ) : null
                      }
                    />
                  );
                }}
              />

              <ReactionPicker
                visible={pickerVisible}
                anchorX={pickerAnchor.x}
                anchorY={pickerAnchor.y}
                onClose={() => setPickerVisible(false)}
                onSelect={(emoji) => {
                  if (pickerMessageId) {
                    const msg = messages.find((m) => m.id === pickerMessageId);
                    setHighlightEmoji(emoji);
                    void sendReaction(
                      pickerMessageId,
                      emoji,
                      "group",
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
                    {voice.isRecording ? (
                      <RecordingSlideMeter
                        variant="voice"
                        locked={voice.isLocked}
                        elapsedMs={recordElapsedMs}
                        onSlideCancel={() => {
                          void discardVoice();
                        }}
                      />
                    ) : videoRecordingActive ? (
                      <RecordingSlideMeter
                        variant="video"
                        locked={videoLocked}
                        elapsedMs={recordElapsedMs}
                        onSlideCancel={() => {
                          void discardVideoRecording();
                        }}
                      />
                    ) : (
                      <>
                        {inputFocused ? (
                          <View pointerEvents="auto" style={styles.neonClip}>
                            <Animated.View style={neonBarStyle} />
                          </View>
                        ) : null}
                        <TextInput
                          testID="group-composer-input"
                          value={draft}
                          onChangeText={setDraft}
                          placeholder="Type a message..."
                          placeholderTextColor={colors.textMuted}
                          editable={!recordingLive}
                          maxLength={MAX_MESSAGE_TEXT_CHARS}
                          onFocus={() => setInputFocused(true)}
                          onBlur={() => setInputFocused(false)}
                          style={[styles.input, { color: colors.text }]}
                        />
                      </>
                    )}
                  </View>
                  <View style={styles.actionSlot} testID="group-composer-actions">
                    {!isSendOnly &&
                    (composerMode === "voice" || composerMode === "video") ? (
                      <View testID="group-voice-controls">
                        <HoldRecordControls
                          ref={holdRecordControlsRef}
                          mode={composerMode}
                          recording={
                            composerMode === "voice"
                              ? voice.isRecording
                              : videoRecordingActive
                          }
                          locked={
                            composerMode === "voice"
                              ? voice.isLocked
                              : videoLocked
                          }
                          dragY={dragY}
                          elapsedMs={recordElapsedMs}
                          maxDurationMs={
                            composerMode === "video"
                              ? VIDEO_RECORD_MAX_MS
                              : VOICE_RECORD_MAX_MS
                          }
                          hideFloatingTimer={
                            voice.isRecording || videoRecordingActive
                          }
                          panHandlers={recordPanResponder.panHandlers}
                          onSendLocked={() => {
                            if (composerMode === "voice") {
                              void finishAndSendVoice();
                            } else {
                              void finishVideoCapture();
                            }
                          }}
                          slideFabX={slideCancelFabX}
                          accentColor={colors.primary}
                          iconColor={colors.onPrimary}
                        />
                      </View>
                    ) : (
                      <View testID="group-composer-send">
                        <ComposerFab
                          isSendOnly={isSendOnly}
                          composerMode={composerMode}
                          onSendText={sendTextMessage}
                          onCycleSendEmpty={() => cycleComposerMode(groupId)}
                          fabColor={colors.primary}
                          iconColor={colors.onPrimary}
                        />
                      </View>
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
  safeArea: { flex: 1 },
  keyboardRoot: { flex: 1 },
  container: { flex: 1 },
  messageList: { padding: 16, gap: 12 },
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
  gestureFill: { flex: 1 },
  senderLabel: {
    fontWeight: "700",
    marginBottom: 4,
    opacity: 0.8,
    fontSize: 12,
  },
});
