import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useAppServices } from "@/lib/services/app-services-context";
import { useColors } from "@/stores/theme-store";

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
  receiptLabel?: string;
  receiptInfo?: string;
};

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
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);

  const title = name || "Group";

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

  useEffect(() => {
    void reload();
  }, [reload]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || !id || sending) return;
    setSending(true);
    setError(null);
    try {
      await syncService.sendGroupOutgoing(id, trimmed);
      setText("");
      await reload();
      const g = await groupStore.getGroup(id);
      if (g) {
        await groupStore.touchPreview(id, trimmed.slice(0, 120), Date.now());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await reload();
    } finally {
      setSending(false);
    }
  };

  const sendSampleMedia = async () => {
    if (!id || sending) return;
    setSending(true);
    setError(null);
    try {
      await syncService.sendGroupOutgoingMedia(id, {
        uri: "file:///group-sample.m4a",
        kind: "voice",
        mimeType: "audio/mp4",
        durationMs: 1000,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const reactTo = async (item: Row) => {
    if (!id || !item.serverEnvelopeId) return;
    try {
      await syncService.sendReaction({
        conversationId: id,
        targetServerEnvelopeId: item.serverEnvelopeId,
        emoji: "👍",
        op: "add",
        groupId: id,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

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
          renderItem={({ item }) => (
            <ScalePressable
              testID={`group-message-${item.id}`}
              onLongPress={() => void reactTo(item)}
              style={[
                styles.bubble,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.surfaceBorder,
                },
              ]}
            >
              <ThemedText style={styles.sender}>{item.senderName}</ThemedText>
              <ThemedText>{item.text}</ThemedText>
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
            </ScalePressable>
          )}
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
          <ScalePressable
            testID="group-attach-media"
            disabled={sending}
            onPress={() => void sendSampleMedia()}
            style={[
              styles.attach,
              {
                borderColor: colors.surfaceBorder,
                backgroundColor: colors.surfaceElevated,
              },
            ]}
          >
            <ThemedText>📎</ThemedText>
          </ScalePressable>
          <TextInput
            testID="group-composer-input"
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.surfaceBorder,
                backgroundColor: colors.surfaceElevated,
              },
            ]}
          />
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
        </View>
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
  sender: { fontWeight: "700", marginBottom: 4, opacity: 0.8 },
  composer: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    alignItems: "center",
  },
  attach: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
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
});
