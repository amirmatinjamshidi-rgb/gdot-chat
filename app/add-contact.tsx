import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenTopAccent } from "@/components/screen-top-accent";
import { ThemedText } from "@/components/themed-text";
import { ScalePressable } from "@/components/ui/scale-pressable";
import type { UserSummaryDto } from "@/lib/api/api-types";
import { ApiError } from "@/lib/api/api-client";
import {
  StartChatError,
  startChatWithUser,
} from "@/lib/chat/start-chat-with-user";
import { useAppServices } from "@/lib/services/app-services-context";
import { useColors } from "@/stores/theme-store";

const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LEN = 2;

export default function AddContactScreen() {
  const router = useRouter();
  const colors = useColors();
  const services = useAppServices();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSummaryDto[]>([]);
  const [searching, setSearching] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selfUserId, setSelfUserId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void services.identityStore.getLocalIdentity().then((id) => {
      setSelfUserId(id?.userId ?? null);
    });
  }, [services.identityStore]);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < MIN_QUERY_LEN) {
        setResults([]);
        setSearchError(null);
        setSearching(false);
        return;
      }

      setSearching(true);
      setSearchError(null);
      try {
        const users = await services.usersApi.search(trimmed);
        setResults(
          selfUserId ? users.filter((u) => u.id !== selfUserId) : users,
        );
      } catch (e) {
        setResults([]);
        if (e instanceof ApiError) {
          setSearchError(
            e.status === 401
              ? "Sign in again to search for users."
              : "Could not search users. Check your connection.",
          );
        } else {
          setSearchError("Could not search users. Try again.");
        }
      } finally {
        setSearching(false);
      }
    },
    [services.usersApi, selfUserId],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const onSelectUser = async (user: UserSummaryDto) => {
    setStartingId(user.id);
    try {
      const conversation = await startChatWithUser({
        peerUserId: user.id,
        peerUsername: user.username,
        usersApi: services.usersApi,
        conversationStore: services.conversationStore,
        identityStore: services.identityStore,
        signalService: services.signalService,
      });
      router.replace({
        pathname: "/ChatRoom",
        params: {
          id: conversation.id,
          name: conversation.peerUsername,
        },
      });
    } catch (e) {
      const message =
        e instanceof StartChatError
          ? e.message
          : e instanceof ApiError
            ? "Could not reach the server. Try again."
            : e instanceof Error
              ? e.message
              : "Could not start chat.";
      Alert.alert("Unable to start chat", message);
    } finally {
      setStartingId(null);
    }
  };

  const hint =
    query.trim().length < MIN_QUERY_LEN
      ? `Type at least ${MIN_QUERY_LEN} characters to search by username.`
      : searching
        ? "Searching…"
        : searchError
          ? searchError
          : results.length === 0
            ? "No users found. Try another username."
            : null;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["bottom"]}
    >
      <ScreenTopAccent />
      <Stack.Screen
        options={{
          title: "Add contact",
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: colors.surfaceElevated },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      <View style={styles.body}>
        <ThemedText
          style={[styles.subtitle, { color: colors.textMuted }]}
          lightColor={colors.textMuted}
          darkColor={colors.textMuted}
        >
          Find someone on Gdot Chat by username, then open a secure chat.
        </ThemedText>

        <TextInput
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.inputFill,
              borderColor: colors.surfaceBorder,
            },
          ]}
          placeholder="Username"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
          editable={startingId === null}
        />

        {hint ? (
          <View style={styles.hintRow}>
            {searching ? (
              <ActivityIndicator size="small" color={colors.tint} />
            ) : null}
            <ThemedText
              style={[
                styles.hint,
                { color: searchError ? colors.error : colors.textMuted },
              ]}
              lightColor={searchError ? colors.error : colors.textMuted}
              darkColor={searchError ? colors.error : colors.textMuted}
            >
              {hint}
            </ThemedText>
          </View>
        ) : null}

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const busy = startingId === item.id;
            return (
              <ScalePressable
                style={[
                  styles.row,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.surfaceBorder,
                    opacity: startingId && !busy ? 0.5 : 1,
                  },
                ]}
                disabled={startingId !== null}
                onPress={() => void onSelectUser(item)}
              >
                <View
                  style={[
                    styles.avatar,
                    {
                      backgroundColor: colors.backgroundSecondary,
                      borderColor: colors.surfaceBorder,
                    },
                  ]}
                >
                  <ThemedText
                    style={[styles.avatarLetter, { color: colors.primary }]}
                    lightColor={colors.primary}
                    darkColor={colors.primary}
                  >
                    {item.username[0]?.toUpperCase() ?? "?"}
                  </ThemedText>
                </View>
                <View style={styles.rowBody}>
                  <ThemedText
                    type="defaultSemiBold"
                    numberOfLines={1}
                    style={{ color: colors.text }}
                    lightColor={colors.text}
                    darkColor={colors.text}
                  >
                    {item.username}
                  </ThemedText>
                  <ThemedText
                    style={[styles.rowSub, { color: colors.textMuted }]}
                    lightColor={colors.textMuted}
                    darkColor={colors.textMuted}
                  >
                    Tap to start chatting
                  </ThemedText>
                </View>
                {busy ? (
                  <ActivityIndicator color={colors.tint} />
                ) : null}
              </ScalePressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 20,
  },
  hint: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: 17,
    fontWeight: "800",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowSub: {
    fontSize: 13,
  },
  sep: {
    height: 8,
  },
});
