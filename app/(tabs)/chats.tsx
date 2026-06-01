import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";

import { ChatSearchBar } from "@/components/chat-search-bar";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useConversations } from "@/hooks/use-conversations";
import { useColorScheme } from "@/hooks/use-color-scheme";

const ROW_HEIGHT = 56;
const AVATAR = 46;

function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatsScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { conversations, loading } = useConversations();

  const filteredChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.peerUsername.toLowerCase().includes(q) ||
        c.lastMessagePreview.toLowerCase().includes(q),
    );
  }, [conversations, query]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ThemedView style={styles.header}>
        <ThemedText type="title" style={styles.title}>
          Chats
        </ThemedText>
        <ScalePressable
          style={styles.iconButton}
          onPress={() => router.push("/Contacts")}
        >
          <IconSymbol
            name="person.badge.plus"
            size={22}
            color={isDark ? "#FFFFFF" : "#000000"}
          />
        </ScalePressable>
      </ThemedView>

      <ChatSearchBar
        value={query}
        onChangeText={setQuery}
        visible
        isDark={isDark}
      />

      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          style={styles.list}
          data={filteredChats}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <ScalePressable
              style={styles.chatRow}
              onPress={() =>
                router.push({
                  pathname: "/ChatRoom",
                  params: {
                    id: item.id,
                    name: item.peerUsername,
                    peerUserId: item.peerUserId,
                    peerDeviceId: item.peerDeviceId,
                  },
                })
              }
            >
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                ]}
              >
                <ThemedText style={styles.avatarText}>
                  {item.peerUsername[0] ?? "?"}
                </ThemedText>
              </View>

              <View style={styles.chatBody}>
                <View style={styles.topLine}>
                  <ThemedText
                    type="defaultSemiBold"
                    numberOfLines={1}
                    style={styles.name}
                  >
                    {item.peerUsername}
                  </ThemedText>
                  <ThemedText style={styles.timeText}>
                    {item.lastMessageAt
                      ? formatTime(item.lastMessageAt)
                      : ""}
                  </ThemedText>
                </View>
                <View style={styles.bottomLine}>
                  <ThemedText numberOfLines={1} style={styles.lastMessage}>
                    {item.lastMessagePreview || "No messages yet"}
                  </ThemedText>
                  {item.unreadCount > 0 ? (
                    <View style={styles.unreadBadge}>
                      <ThemedText style={styles.unreadText}>
                        {item.unreadCount}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              </View>
            </ScalePressable>
          )}
          ItemSeparatorComponent={() => (
            <View
              style={[
                styles.separator,
                { backgroundColor: isDark ? "#334155" : "#E2E8F0" },
              ]}
            />
          )}
          ListEmptyComponent={
            <Animated.View entering={FadeIn.duration(180)} style={styles.empty}>
              <ThemedText style={styles.emptyText}>
                No chats yet — add a contact
              </ThemedText>
            </Animated.View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
  },
  iconButton: {
    padding: 6,
  },
  loader: {
    marginTop: 40,
  },
  list: {
    flex: 1,
  },
  chatRow: {
    minHeight: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 5,
    gap: 10,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  avatarText: {
    fontSize: 17,
    fontWeight: "700",
  },
  chatBody: {
    flex: 1,
    justifyContent: "center",
    gap: 2,
    minHeight: AVATAR,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  bottomLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 15,
  },
  timeText: {
    fontSize: 11,
    opacity: 0.5,
  },
  lastMessage: {
    flex: 1,
    fontSize: 13,
    opacity: 0.62,
  },
  unreadBadge: {
    backgroundColor: "#3B82F6",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  unreadText: {
    color: "white",
    fontSize: 10,
    fontWeight: "700",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 14 + AVATAR + 10,
  },
  empty: {
    paddingTop: 40,
    alignItems: "center",
  },
  emptyText: {
    opacity: 0.55,
  },
});
