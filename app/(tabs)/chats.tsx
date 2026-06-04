import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatSearchBar } from "@/components/chat-search-bar";
import { ScreenTopAccent } from "@/components/screen-top-accent";
import { ThemedText } from "@/components/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useConversations } from "@/hooks/use-conversations";
import { filterConversations } from "@/lib/chat/filter-conversations";
import { formatConversationTime } from "@/lib/chat/format-conversation-time";
import { useColors, useThemeStore } from "@/stores/theme-store";

const ROW_HEIGHT = 56;
const AVATAR = 46;

export default function ChatsScreen() {
  const colors = useColors();
  const mode = useThemeStore((state) => state.mode);
  const isDark = mode === "dark";
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const { conversations, loading } = useConversations();

  const filteredChats = useMemo(
    () => filterConversations(conversations, searchQuery),
    [conversations, searchQuery],
  );

  return (
    <View style={styles.root}>
      <ScreenTopAccent />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
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
            accessibilityRole="button"
            accessibilityLabel="Add contact"
            style={[
              styles.iconButton,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.surfaceBorder,
              },
            ]}
            onPress={() => router.push("/add-contact")}
          >
            <IconSymbol
              name="person.badge.plus"
              size={22}
              color={colors.text}
            />
          </ScalePressable>
        </View>

        <ChatSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          visible
          isDark={isDark}
          accentHex={colors.tint}
          glowHex={colors.accentGlow}
        />

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={filteredChats}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            alwaysBounceVertical={false}
            overScrollMode="never"
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
                    params: {
                      id: item.id,
                      name: item.peerUsername,
                    },
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
                    {item.peerUsername[0]?.toUpperCase() ?? "?"}
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
                      {item.peerUsername}
                    </ThemedText>
                    <ThemedText
                      style={[styles.timeText, { color: colors.textMuted }]}
                      lightColor={colors.textMuted}
                      darkColor={colors.textMuted}
                    >
                      {formatConversationTime(item.lastMessageAt)}
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
                      {item.lastMessagePreview || "No messages yet"}
                    </ThemedText>
                    {item.unreadCount > 0 ? (
                      <View
                        style={[
                          styles.unreadBadge,
                          { backgroundColor: colors.primary },
                        ]}
                      >
                        <ThemedText
                          style={[
                            styles.unreadText,
                            { color: colors.onPrimary },
                          ]}
                          lightColor={colors.onPrimary}
                          darkColor={colors.onPrimary}
                        >
                          {item.unreadCount}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                </View>
              </ScalePressable>
            )}
            ItemSeparatorComponent={() => (
              <View style={styles.separatorGhost} />
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <ThemedText
                  type="defaultSemiBold"
                  style={{ color: colors.text }}
                  lightColor={colors.text}
                  darkColor={colors.text}
                >
                  {searchQuery.trim() ? "No matching chats" : "No chats yet"}
                </ThemedText>
                <ThemedText
                  style={[styles.emptyHint, { color: colors.textMuted }]}
                  lightColor={colors.textMuted}
                  darkColor={colors.textMuted}
                >
                  {searchQuery.trim()
                    ? "Try a different search."
                    : "Tap + to find someone by username and start chatting."}
                </ThemedText>
                {!searchQuery.trim() ? (
                  <ScalePressable
                    style={[
                      styles.emptyCta,
                      { backgroundColor: colors.tint },
                    ]}
                    onPress={() => router.push("/add-contact")}
                  >
                    <ThemedText
                      style={{ color: colors.onPrimary, fontWeight: "700" }}
                      lightColor={colors.onPrimary}
                      darkColor={colors.onPrimary}
                    >
                      Add contact
                    </ThemedText>
                  </ScalePressable>
                ) : null}
              </View>
            }
          />
        )}
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
    paddingBottom: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
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
    marginTop: 4,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 40,
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
  emptyCta: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
});
