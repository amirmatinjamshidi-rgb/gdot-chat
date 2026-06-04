import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  View,
} from "react-native";

import { ChatSearchBar } from "@/components/chat-search-bar";
import { ScreenTopAccent } from "@/components/screen-top-accent";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useConversations } from "@/hooks/use-conversations";
import { filterConversations } from "@/lib/chat/filter-conversations";
import { useColors, useThemeStore } from "@/stores/theme-store";

const AVATAR = 46;

export default function ContactsTabScreen() {
  const colors = useColors();
  const mode = useThemeStore((state) => state.mode);
  const isDark = mode === "dark";
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const { conversations, loading } = useConversations();

  const filteredContacts = useMemo(
    () => filterConversations(conversations, searchQuery),
    [conversations, searchQuery],
  );

  return (
    <ThemedView style={styles.container}>
      <ScreenTopAccent />
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <ThemedText
            type="title"
            style={[styles.title, { color: colors.text }]}
            lightColor={colors.text}
            darkColor={colors.text}
          >
            Contacts
          </ThemedText>
          <ThemedText
            style={[styles.sub, { color: colors.textMuted }]}
            lightColor={colors.textMuted}
            darkColor={colors.textMuted}
          >
            People you have started a chat with.
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
          <IconSymbol name="person.badge.plus" size={22} color={colors.text} />
        </ScalePressable>
      </View>
      <View style={styles.searchBarContainer}>
        <ChatSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          visible
          isDark={isDark}
          accentHex={colors.tint}
          glowHex={colors.accentGlow}
        />
      </View>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={filteredContacts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <ThemedText
                type="defaultSemiBold"
                style={{ color: colors.text }}
                lightColor={colors.text}
                darkColor={colors.text}
              >
                {searchQuery.trim() ? "No matching contacts" : "No contacts yet"}
              </ThemedText>
              <ThemedText
                style={[styles.emptyHint, { color: colors.textMuted }]}
                lightColor={colors.textMuted}
                darkColor={colors.textMuted}
              >
                {searchQuery.trim()
                  ? "Try a different search."
                  : "Add someone by username to start a secure chat."}
              </ThemedText>
              {!searchQuery.trim() ? (
                <ScalePressable
                  style={[styles.emptyCta, { backgroundColor: colors.tint }]}
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
          renderItem={({ item }) => (
            <ScalePressable
              style={[
                styles.row,
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
                    backgroundColor: colors.backgroundSecondary,
                    borderWidth: 1,
                    borderColor: colors.surfaceBorder,
                  },
                ]}
              >
                <ThemedText
                  style={[styles.avatarLetter, { color: colors.primary }]}
                  lightColor={colors.primary}
                  darkColor={colors.primary}
                >
                  {item.peerUsername[0]?.toUpperCase() ?? "?"}
                </ThemedText>
              </View>
              <View style={styles.rowBody}>
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
                  style={[styles.statusText, { color: colors.textMuted }]}
                  lightColor={colors.textMuted}
                  darkColor={colors.textMuted}
                >
                  @{item.peerUsername}
                </ThemedText>
              </View>
            </ScalePressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.separatorGhost} />}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 52,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
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
  list: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    paddingTop: 32,
  },
  searchBarContainer: {
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 120,
    flexGrow: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 12,
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    marginVertical: 4,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: "center",
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    fontSize: 17,
    fontWeight: "800",
  },
  name: {
    fontSize: 16,
    lineHeight: 22,
  },
  statusText: {
    fontSize: 13,
    lineHeight: 18,
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
