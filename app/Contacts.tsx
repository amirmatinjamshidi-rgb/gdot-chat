import { Stack, useRouter } from "expo-router";
<<<<<<< HEAD
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInLeft } from "react-native-reanimated";
=======
import React, { useEffect } from "react";
import { FlatList, StyleSheet, View } from "react-native";
>>>>>>> 5e2230b503428a5691d3fc1ad90a70ebac58c20d

import { ChatSearchBar } from "@/components/chat-search-bar";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ScalePressable } from "@/components/ui/scale-pressable";
<<<<<<< HEAD
import { ensureConversation } from "@/lib/auth/start-conversation";
import { randomUUID } from "@/lib/crypto/random-id";
import type { UserSummaryDto } from "@/lib/api/api-types";
import { useAppServices } from "@/lib/services/app-services-context";
import { useColorScheme } from "@/hooks/use-color-scheme";

=======
import { useThemeStore, useColors } from "@/stores/theme-store";
import { useContactsStore, type Contact } from "@/stores/contacts-store";

const AVATAR = 46;

>>>>>>> 5e2230b503428a5691d3fc1ad90a70ebac58c20d
export default function ContactsScreen() {
  const colors = useColors();
  const mode = useThemeStore((state) => state.mode);
  const isDark = mode === "dark";
  const router = useRouter();
  const { usersApi, conversationStore } = useAppServices();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSummaryDto[]>([]);
  const [loading, setLoading] = useState(false);

  const onSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      const users = await usersApi.search(q);
      setResults(users);
    } catch {
      setResults([
        {
          id: randomUUID(),
          username: q,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const startChat = async (user: UserSummaryDto) => {
    const conversation = await ensureConversation({
      conversationStore,
      peerUserId: user.id,
      peerUsername: user.username,
      peerDeviceId: user.id,
    });
    router.push({
      pathname: "/ChatRoom",
      params: {
        id: conversation.id,
        name: user.username,
        peerUserId: user.id,
        peerDeviceId: user.id,
      },
    });
  };

  const searchQuery = useContactsStore((state) => state.searchQuery);
  const setSearchQuery = useContactsStore((state) => state.setSearchQuery);
  const getFilteredContacts = useContactsStore((state) => state.getFilteredContacts);
  const initializeMockData = useContactsStore((state) => state.initializeMockData);
  const filteredContacts = getFilteredContacts();

  useEffect(() => {
    initializeMockData();
  }, [initializeMockData]);

  const statusColor = (status: Contact["status"]) => {
    if (status === "Online") return colors.success;
    if (status === "Away") return colors.tintMuted;
    return colors.textMuted;
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: "Contacts" }} />
<<<<<<< HEAD
      <View style={styles.searchRow}>
        <TextInput
          style={[
            styles.searchInput,
            { borderColor: isDark ? "#475569" : "#cbd5e1" },
          ]}
          placeholder="Search username"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void onSearch()}
          autoCapitalize="none"
        />
        <ScalePressable style={styles.searchBtn} onPress={() => void onSearch()}>
          <ThemedText style={styles.searchBtnText}>Search</ThemedText>
        </ScalePressable>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : null}
      <FlatList
        style={styles.list}
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <Animated.View
            entering={FadeInLeft.delay(Math.min(index, 10) * 40).springify()}
          >
            <ScalePressable
              style={styles.contactItem}
              onPress={() => void startChat(item)}
            >
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
                ]}
              >
                <ThemedText>{item.username[0]?.toUpperCase() ?? "?"}</ThemedText>
              </View>
              <View>
                <ThemedText type="defaultSemiBold">{item.username}</ThemedText>
              </View>
            </ScalePressable>
          </Animated.View>
        )}
        ListEmptyComponent={
          <ThemedText style={styles.hint}>
            Search for a user to start an encrypted chat
          </ThemedText>
        }
=======
      <ChatSearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        visible
        isDark={isDark}
        accentHex={colors.tint}
        glowHex={colors.accentGlow}
      />
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
              No contacts
            </ThemedText>
            <ThemedText
              style={[styles.emptyHint, { color: colors.textMuted }]}
              lightColor={colors.textMuted}
              darkColor={colors.textMuted}
            >
              Sync or import contacts when that feature is enabled.
            </ThemedText>
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
                params: { id: item.id, name: item.name },
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
                {item.name[0]}
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
                {item.name}
              </ThemedText>
              <ThemedText
                style={[styles.statusText, { color: statusColor(item.status) }]}
              >
                {item.status}
              </ThemedText>
            </View>
          </ScalePressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.separatorGhost} />}
>>>>>>> 5e2230b503428a5691d3fc1ad90a70ebac58c20d
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchRow: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 16,
  },
<<<<<<< HEAD
  searchBtn: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  searchBtnText: { color: "#fff", fontWeight: "600" },
  list: { flex: 1 },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
=======
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 24,
    flexGrow: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
>>>>>>> 5e2230b503428a5691d3fc1ad90a70ebac58c20d
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
<<<<<<< HEAD
  hint: { padding: 20, opacity: 0.6, textAlign: "center" },
=======
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
>>>>>>> 5e2230b503428a5691d3fc1ad90a70ebac58c20d
});
