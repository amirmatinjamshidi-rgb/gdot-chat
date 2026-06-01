import { Stack, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInLeft } from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { ensureConversation } from "@/lib/auth/start-conversation";
import type { UserSummaryDto } from "@/lib/api/api-types";
import { useAppServices } from "@/lib/services/app-services-context";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function ContactsScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";
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
          id: crypto.randomUUID(),
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

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: "Contacts" }} />
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
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  hint: { padding: 20, opacity: 0.6, textAlign: "center" },
});
