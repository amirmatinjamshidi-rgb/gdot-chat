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
  senderName: string;
  text: string;
  createdAt: number;
};

export default function GroupRoomScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const colors = useColors();
  const router = useRouter();
  const { messageStore, syncService, identityStore, groupStore } =
    useAppServices();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = name || "Group";

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const local = await identityStore.getLocalIdentity();
      const msgs = await messageStore.listByConversation(id, 100);
      setRows(
        msgs.map((m) => ({
          id: m.id,
          senderName:
            m.senderDeviceId === "system"
              ? "System"
              : m.direction === "outgoing"
                ? "You"
                : m.senderDeviceId.slice(0, 8),
          text: m.plaintext,
          createdAt: m.createdAt,
        })),
      );
      void local;
    } catch {
      setRows([]);
    }
  }, [id, messageStore, identityStore]);

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
            <View
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
            </View>
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
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  sender: { fontWeight: "700", marginBottom: 2, opacity: 0.8 },
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
  send: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
});
