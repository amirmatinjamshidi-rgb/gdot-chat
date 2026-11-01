import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  PanResponder,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  HoldRecordControls,
  LOCK_DRAG_PX,
  type HoldRecordControlsHandle,
} from "@/components/hold-record-controls";
import { ReactionPicker } from "@/components/reactions/reaction-picker";
import { TextMessageBubble } from "@/components/reactions/text-message-bubble";
import { ThemedText } from "@/components/themed-text";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useReactions } from "@/hooks/use-reactions";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { VOICE_RECORD_MAX_MS } from "@/lib/config";
import { useAppServices } from "@/lib/services/app-services-context";
import { useColors } from "@/stores/theme-store";

const HOLD_MS = 320;
const FAB_CANCEL_DRAG_PX = 100;

type Row = {
  id: string;
  clientId: string;
  senderName: string;
  text: string;
  createdAt: number;
  direction: "incoming" | "outgoing";
  status: string;
  senderDeviceId: string;
  serverEnvelopeId?: string;
  kind: string;
  receiptLabel?: string;
  receiptInfo?: string;
};

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function GroupRoomScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const {
    messageStore,
    identityStore,
    syncService,
    groupStore,
  } = useAppServices();
  const colors = useColors();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(
    null,
  );
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerMessageId, setPickerMessageId] = useState<string | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState({ x: 0, y: 0 });
  const [highlightEmoji, setHighlightEmoji] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0);

  const holdControlsRef = useRef<HoldRecordControlsHandle>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdArmedRef = useRef(false);
  const recordingLiveRef = useRef(false);
  const slideFabX = useSharedValue(0);

  const title = name || "Group";
  const groupId = id ?? "";

  const { reactionsByMessageId, sendReaction, currentUserId } = useReactions({
    conversationId: id,
    groupId: id,
  });

  const sendVoiceResult = useCallback(
    async (result: { uri: string; durationMs: number }) => {
      if (!id) return;
      try {
        await syncService.sendGroupOutgoingMedia(id, {
          uri: result.uri,
          kind: "voice",
          mimeType: "audio/mp4",
          durationMs: result.durationMs,
        });
        await reloadRef.current();
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [id, syncService],
  );

  const voice = useVoiceRecorder({
    conversationId: groupId || "group",
    maxDurationMs: VOICE_RECORD_MAX_MS,
    onMaxDuration: (result) => {
      void sendVoiceResult(result);
    },
    onError: (message) => setError(message),
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const reloadRef = useRef<() => Promise<void>>(async () => undefined);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const local = await identityStore.getLocalIdentity();
      const msgs = await messageStore.listByConversation(id, 100);
      const members = ((await groupStore.listMembers(id, true)) ?? []).filter(
        (x) => x.userId !== local?.userId,
      );
      const next: Row[] = [];
      const unreadIncoming: {
        clientMessageId: string;
        senderUserId: string;
        senderDeviceId: string;
      }[] = [];
      for (const m of msgs) {
        let receiptLabel: string | undefined;
        let receiptInfo: string | undefined;
        if (m.direction === "outgoing") {
          const agg = await syncService.getGroupReceiptAggregate(id, m.clientId);
          if (agg) {
            const deliveredAll =
              members.length > 0 &&
              members.every((mem) => agg.deliveredUserIds.includes(mem.userId));
            receiptLabel = deliveredAll
              ? `Delivered to all · Read by ${agg.readUserIds.length}`
              : `Delivered ${agg.deliveredUserIds.length}/${members.length} · Read ${agg.readUserIds.length}`;
            const nameFor = (uid: string) =>
              members.find((mem) => mem.userId === uid)?.username ??
              uid.slice(0, 8);
            receiptInfo = [
              agg.deliveredUserIds.length
                ? `Delivered: ${agg.deliveredUserIds.map(nameFor).join(", ")}`
                : "Delivered: —",
              agg.readUserIds.length
                ? `Read: ${agg.readUserIds.map(nameFor).join(", ")}`
                : "Read: —",
            ].join("\n");
          } else if (m.status === "delivered" || m.status === "sent") {
            receiptLabel = m.status;
          }
        } else if (m.senderDeviceId !== "system" && m.senderUserId) {
          unreadIncoming.push({
            clientMessageId: m.clientId,
            senderUserId: m.senderUserId,
            senderDeviceId: m.senderDeviceId,
          });
        }
        next.push({
          id: m.id,
          clientId: m.clientId,
          senderName:
            m.senderDeviceId === "system"
              ? "System"
              : m.direction === "outgoing"
                ? "You"
                : m.senderDeviceId.slice(0, 8),
          text:
            m.kind === "voice"
              ? "Voice message"
              : m.kind === "video"
                ? "Video message"
                : m.plaintext,
          createdAt: m.createdAt,
          direction: m.direction,
          status: m.status,
          senderDeviceId: m.senderDeviceId,
          serverEnvelopeId: m.serverEnvelopeId,
          kind: m.kind,
          receiptLabel,
          receiptInfo,
        });
      }
      setRows(next);
      if (unreadIncoming.length) {
        void syncService.markGroupMessagesRead(id, unreadIncoming);
      }
    } catch {
      setRows([]);
    }
  }, [id, messageStore, identityStore, syncService, groupStore]);

  reloadRef.current = reload;

  useEffect(() => {
    void reload();
  }, [reload]);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const finishAndSendVoice = useCallback(async () => {
    recordingLiveRef.current = false;
    holdArmedRef.current = false;
    const result = await voiceRef.current.finish();
    holdControlsRef.current?.resetLayout();
    setDragY(0);
    if (result) await sendVoiceResult(result);
  }, [sendVoiceResult]);

  const discardVoice = useCallback(async () => {
    recordingLiveRef.current = false;
    holdArmedRef.current = false;
    await voiceRef.current.discard();
    holdControlsRef.current?.resetLayout();
    setDragY(0);
  }, []);

  const recordPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => text.trim().length === 0,
        onMoveShouldSetPanResponder: () =>
          recordingLiveRef.current || holdArmedRef.current,
        onPanResponderGrant: () => {
          if (voiceRef.current.isLocked) return;
          slideFabX.value = 0;
          holdArmedRef.current = false;
          recordingLiveRef.current = false;
          setDragY(0);
          clearHoldTimer();
          holdTimerRef.current = setTimeout(() => {
            holdTimerRef.current = null;
            holdArmedRef.current = true;
            void (async () => {
              const ok = await voiceRef.current.start();
              if (ok) recordingLiveRef.current = true;
              else holdArmedRef.current = false;
            })();
          }, HOLD_MS);
        },
        onPanResponderMove: (_, g) => {
          if (voiceRef.current.isLocked) return;
          if (!recordingLiveRef.current && !holdArmedRef.current) return;
          setDragY(g.dy);
          if (g.dy <= -LOCK_DRAG_PX && recordingLiveRef.current) {
            voiceRef.current.lock();
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          if (recordingLiveRef.current && !voiceRef.current.isLocked) {
            slideFabX.value = Math.max(
              -FAB_CANCEL_DRAG_PX * 1.25,
              Math.min(0, g.dx),
            );
          }
        },
        onPanResponderRelease: () => {
          const dx = slideFabX.value;
          const shouldCancel =
            recordingLiveRef.current &&
            !voiceRef.current.isLocked &&
            dx <= -FAB_CANCEL_DRAG_PX;
          slideFabX.value = 0;
          setDragY(0);
          clearHoldTimer();
          if (shouldCancel) {
            void discardVoice();
            return;
          }
          if (voiceRef.current.isLocked) {
            holdArmedRef.current = false;
            return;
          }
          if (recordingLiveRef.current) {
            void finishAndSendVoice();
            return;
          }
          holdArmedRef.current = false;
        },
        onPanResponderTerminate: () => {
          clearHoldTimer();
          if (recordingLiveRef.current && !voiceRef.current.isLocked) {
            void discardVoice();
          }
        },
      }),
    [clearHoldTimer, discardVoice, finishAndSendVoice, slideFabX, text],
  );

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || !id || sending) return;
    setSending(true);
    setError(null);
    try {
      await syncService.sendGroupOutgoing(id, trimmed);
      setText("");
      await reload();
      await groupStore.touchPreview(id, trimmed.slice(0, 120), Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await reload();
    } finally {
      setSending(false);
    }
  };

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
      const msg = rows.find((m) => m.id === messageId);
      setHighlightEmoji(emoji);
      void sendReaction(messageId, emoji, "group", msg?.serverEnvelopeId);
      setTimeout(() => setHighlightEmoji(null), 500);
    },
    [rows, sendReaction],
  );

  const showMic = text.trim().length === 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <ScalePressable
              testID="group-info-button"
              onPress={() =>
                router.push({
                  pathname: "/GroupInfo" as never,
                  params: { id: id!, name: title },
                })
              }
            >
              <ThemedText style={{ color: colors.tint }}>Info</ThemedText>
            </ScalePressable>
          ),
        }}
      />
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <FlatList
          testID="group-message-list"
          data={rows}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          renderItem={({ item }) => {
            if (item.senderDeviceId === "system") {
              return (
                <ThemedText
                  testID={`group-system-${item.id}`}
                  style={{ textAlign: "center", opacity: 0.6 }}
                >
                  {item.text}
                </ThemedText>
              );
            }
            const isMine = item.direction === "outgoing";
            return (
              <View>
                {!isMine ? (
                  <ThemedText style={styles.sender}>{item.senderName}</ThemedText>
                ) : null}
                <TextMessageBubble
                  messageId={item.id}
                  text={item.text}
                  time={formatTime(item.createdAt)}
                  isMine={isMine}
                  primaryColor={colors.text}
                  timeColor={colors.textMuted}
                  deliveryStatus={item.status}
                  bubbleStyle={[
                    styles.bubble,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.surfaceBorder,
                    },
                  ]}
                  reactions={reactionsByMessageId[item.id] ?? []}
                  myId={currentUserId}
                  highlightEmoji={highlightEmoji}
                  onLongPress={handleMessageLongPress}
                  onReactionPress={handleReactionPress}
                />
                {item.receiptLabel ? (
                  <ScalePressable
                    testID={`group-receipt-${item.id}`}
                    onPress={() =>
                      setExpandedReceiptId((cur) =>
                        cur === item.id ? null : item.id,
                      )
                    }
                  >
                    <ThemedText
                      style={{ opacity: 0.6, fontSize: 12, marginTop: 4 }}
                    >
                      {item.receiptLabel}
                    </ThemedText>
                  </ScalePressable>
                ) : null}
                {expandedReceiptId === item.id && item.receiptInfo ? (
                  <ThemedText
                    testID={`group-receipt-info-${item.id}`}
                    style={{ opacity: 0.55, fontSize: 11, marginTop: 4 }}
                  >
                    {item.receiptInfo}
                  </ThemedText>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={
            <ThemedText style={{ opacity: 0.6, textAlign: "center" }}>
              No messages yet
            </ThemedText>
          }
        />
        {error ? (
          <ThemedText style={{ color: colors.error, paddingHorizontal: 12 }}>
            {error}
          </ThemedText>
        ) : null}
        <View style={styles.composer}>
          <TextInput
            testID="group-composer-input"
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={colors.textMuted}
            editable={!voice.isRecording}
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.surfaceBorder,
                backgroundColor: colors.surfaceElevated,
              },
            ]}
          />
          {showMic ? (
            <View style={styles.micWrap} testID="group-voice-controls">
              <HoldRecordControls
                ref={holdControlsRef}
                mode="voice"
                recording={voice.isRecording}
                locked={voice.isLocked}
                dragY={dragY}
                elapsedMs={voice.elapsedMs}
                maxDurationMs={VOICE_RECORD_MAX_MS}
                hideFloatingTimer={false}
                panHandlers={recordPanResponder.panHandlers}
                onSendLocked={() => void finishAndSendVoice()}
                slideFabX={slideFabX}
                accentColor={colors.tint}
              />
            </View>
          ) : (
            <ScalePressable
              testID="group-composer-send"
              disabled={sending}
              onPress={() => void send()}
              style={[styles.send, { backgroundColor: colors.tint }]}
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
                  Send
                </ThemedText>
              )}
            </ScalePressable>
          )}
        </View>
        <ReactionPicker
          visible={pickerVisible}
          anchorX={pickerAnchor.x}
          anchorY={pickerAnchor.y}
          onClose={() => setPickerVisible(false)}
          onSelect={(emoji) => {
            if (pickerMessageId) {
              const msg = rows.find((m) => m.id === pickerMessageId);
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
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  bubble: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  sender: { fontWeight: "700", marginBottom: 4, opacity: 0.8, fontSize: 12 },
  composer: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    alignItems: "center",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  send: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  micWrap: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
});
