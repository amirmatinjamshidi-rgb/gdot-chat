import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatSearchBar } from "@/components/chat-search-bar";
import { ThemedText } from "@/components/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useConversations } from "@/hooks/use-conversations";
import { useThemePalette } from "@/providers/theme-palette-provider";

const ROW_HEIGHT = 56;
const AVATAR = 46;

function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatsScreen() {
  const { colors, mode } = useThemePalette();
  const isDark = mode === "dark";
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
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.gradientEnd, colors.background, colors.backgroundSecondary]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
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
              Your conversations, elevated.
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

        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        ) : (
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
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(255,255,255,0.35)",
                    borderColor: colors.surfaceBorder,
                  },
                ]}
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
                    {item.peerUsername[0] ?? "?"}
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
                      {item.lastMessageAt ? formatTime(item.lastMessageAt) : ""}
                    </ThemedText>
                  </View>
                  <View style={styles.bottomLine}>
                    <ThemedText
                      numberOfLines={1}
                      style={[styles.lastMessage, { color: colors.textSecondary }]}
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
                          style={[styles.unreadText, { color: colors.onPrimary }]}
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
            ItemSeparatorComponent={() => <View style={styles.separatorGhost} />}
            ListEmptyComponent={
              <Animated.View entering={FadeIn.duration(180)} style={styles.empty}>
                <ThemedText
                  style={{ color: colors.textMuted }}
                  lightColor={colors.textMuted}
                  darkColor={colors.textMuted}
                >
                  No chats yet — add a contact
                </ThemedText>
              </Animated.View>
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
  loader: {
    marginTop: 40,
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
    opacity: 0.85,
  },
  lastMessage: {
    flex: 1,
    fontSize: 13,
    opacity: 0.88,
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
    alignItems: "center",
  },
});
