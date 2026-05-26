import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";

import { ChatSearchBar } from "@/components/chat-search-bar";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";

const ROW_HEIGHT = 56;
const AVATAR = 46;

const MOCK_CHATS = [
  {
    id: "1",
    name: "Alice",
    lastMessage: "Hey, how are you?",
    time: "10:30 AM",
    unread: 2,
  },
  {
    id: "2",
    name: "Bob",
    lastMessage: "Did you see the latest update?",
    time: "Yesterday",
    unread: 0,
  },
  {
    id: "3",
    name: "Charlie",
    lastMessage: "Meeting at 5?",
    time: "Yesterday",
    unread: 1,
  },
  {
    id: "4",
    name: "Diana",
    lastMessage: "Sent the files.",
    time: "Mon",
    unread: 0,
  },
  {
    id: "5",
    name: "Eve",
    lastMessage: "Call me when free.",
    time: "Sun",
    unread: 3,
  },
];

export default function ChatsScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const [query, setQuery] = useState("");

  const filteredChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MOCK_CHATS;
    return MOCK_CHATS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q),
    );
  }, [query]);

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
                params: { id: item.id, name: item.name },
              })
            }
          >
            <View
              style={[
                styles.avatar,
                { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
              ]}
            >
              <ThemedText style={styles.avatarText}>{item.name[0]}</ThemedText>
            </View>

            <View style={styles.chatBody}>
              <View style={styles.topLine}>
                <ThemedText
                  type="defaultSemiBold"
                  numberOfLines={1}
                  style={styles.name}
                >
                  {item.name}
                </ThemedText>
                <ThemedText style={styles.timeText}>{item.time}</ThemedText>
              </View>
              <View style={styles.bottomLine}>
                <ThemedText numberOfLines={1} style={styles.lastMessage}>
                  {item.lastMessage}
                </ThemedText>
                {item.unread > 0 ? (
                  <View style={styles.unreadBadge}>
                    <ThemedText style={styles.unreadText}>
                      {item.unread}
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
            <ThemedText style={styles.emptyText}>No chats found</ThemedText>
          </Animated.View>
        }
      />
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
