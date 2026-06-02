import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatSearchBar } from "@/components/chat-search-bar";

import { ScreenTopAccent } from "@/components/screen-top-accent";
import { ThemedText } from "@/components/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useThemePalette } from "@/providers/theme-palette-provider";

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
  const { colors, mode } = useThemePalette();
  const isDark = mode === "dark";
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
    <View style={styles.root}>
      <ScreenTopAccent />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <View>
            <ThemedText
              type="title"
              style={[styles.title, { color: colors.text }]}
              lightColor={colors.text}
              darkColor={colors.text}
            >
              Chats
            </ThemedText>
            <ThemedText
              style={[styles.sub, { color: colors.textMuted }]}
              lightColor={colors.textMuted}
              darkColor={colors.textMuted}
            >
              Search by name or last message. Tap a row to open the chat.
            </ThemedText>
          </View>
          <ScalePressable
            style={[
              styles.iconButton,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.surfaceBorder,
              },
            ]}
            onPress={() => router.push("/Contacts")}
          >
            <IconSymbol
              name="person.badge.plus"
              size={22}
              color={colors.text}
            />
          </ScalePressable>
        </View>

        <ChatSearchBar
          value={query}
          onChangeText={setQuery}
          visible
          isDark={isDark}
          accentHex={colors.tint}
          glowHex={colors.accentGlow}
        />

        <FlatList
          style={styles.list}
          data={filteredChats}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <ScalePressable
              style={[
                styles.chatRow,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.surfaceBorder,
                },
              ]}
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
                  {
                    backgroundColor: isDark
                      ? colors.surfaceElevated
                      : colors.backgroundSecondary,
                    borderWidth: 1,
                    borderColor: colors.surfaceBorder,
                  },
                ]}
              >
                <ThemedText
                  style={[styles.avatarText, { color: colors.primary }]}
                  lightColor={colors.primary}
                  darkColor={colors.primary}
                >
                  {item.name[0]}
                </ThemedText>
              </View>

              <View style={styles.chatBody}>
                <View style={styles.topLine}>
                  <ThemedText
                    type="defaultSemiBold"
                    numberOfLines={1}
                    style={[styles.name, { color: colors.text }]}
                    lightColor={colors.text}
                    darkColor={colors.text}
                  >
                    {item.name}
                  </ThemedText>
                  <ThemedText
                    style={[styles.timeText, { color: colors.textMuted }]}
                    lightColor={colors.textMuted}
                    darkColor={colors.textMuted}
                  >
                    {item.time}
                  </ThemedText>
                </View>
                <View style={styles.bottomLine}>
                  <ThemedText
                    numberOfLines={1}
                    style={[
                      styles.lastMessage,
                      { color: colors.textSecondary },
                    ]}
                    lightColor={colors.textSecondary}
                    darkColor={colors.textSecondary}
                  >
                    {item.lastMessage}
                  </ThemedText>
                  {item.unread > 0 ? (
                    <View
                      style={[
                        styles.unreadBadge,
                        { backgroundColor: colors.primary },
                      ]}
                    >
                      <ThemedText
                        style={[styles.unreadText, { color: colors.onPrimary }]}
                        lightColor={colors.onPrimary}
                        darkColor={colors.onPrimary}
                      >
                        {item.unread}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              </View>
            </ScalePressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.separatorGhost} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <ThemedText
                type="defaultSemiBold"
                style={{ color: colors.text }}
                lightColor={colors.text}
                darkColor={colors.text}
              >
                {query.trim() ? "No matching chats" : "No chats yet"}
              </ThemedText>
              <ThemedText
                style={[styles.emptyHint, { color: colors.textMuted }]}
                lightColor={colors.textMuted}
                darkColor={colors.textMuted}
              >
                {query.trim()
                  ? "Try a different search."
                  : "Start a chat from your contacts when available."}
              </ThemedText>
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: "transparent",
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  sub: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  iconButton: {
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  list: {
    flex: 1,
    paddingTop: 4,
  },
  chatRow: {
    minHeight: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
    marginHorizontal: 10,
    marginVertical: 4,
    borderRadius: 18,
    borderWidth: 1,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 17,
    fontWeight: "800",
  },
  chatBody: {
    flex: 1,
    justifyContent: "center",
    gap: 4,
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
    fontSize: 16,
  },
  timeText: {
    fontSize: 11,
  },
  lastMessage: {
    flex: 1,
    fontSize: 13,
  },
  unreadBadge: {
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  unreadText: {
    fontSize: 11,
    fontWeight: "800",
  },
  separatorGhost: {
    height: 0,
  },
  empty: {
    paddingTop: 48,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyHint: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
