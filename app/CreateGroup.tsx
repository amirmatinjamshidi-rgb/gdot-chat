import { Stack, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenTopAccent } from "@/components/screen-top-accent";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { bytesToBase64, textToBytes } from "@/lib/crypto/encoding";
import { useAppServices } from "@/lib/services/app-services-context";
import { useColors } from "@/stores/theme-store";

type PickUser = { userId: string; username: string };

export default function CreateGroupScreen() {
  const [groupName, setGroupName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickUser[]>([]);
  const [selected, setSelected] = useState<PickUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const colors = useColors();
  const { usersApi, groupsApi, groupStore, groupSenderKeyService, identityStore } = useAppServices();

  const canSubmit = groupName.trim().length > 0 && selected.length > 0 && !busy;

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      const found = await usersApi.search(q.trim());
      setResults(
        found.map((u) => ({ userId: u.id, username: u.username })),
      );
    } catch {
      setResults([]);
    }
  };

  const toggle = (u: PickUser) => {
    setSelected((prev) =>
      prev.some((x) => x.userId === u.userId)
        ? prev.filter((x) => x.userId !== u.userId)
        : [...prev, u],
    );
  };

  const createNewGroup = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const meta = bytesToBase64(
        textToBytes(JSON.stringify({ name: groupName.trim() })),
      );
      const group = await groupsApi.create({
        memberUserIds: selected.map((s) => s.userId),
        encryptedMetadataBase64: meta,
      });
      await groupStore.upsertGroup({
        id: group.id,
        encryptedMetadata: group.encryptedMetadataBase64,
        createdByUserId: group.createdByUserId,
        createdAt: Date.parse(group.createdAt) || Date.now(),
        myRole: group.myRole,
        lastMessagePreview: "",
        lastMessageAt: Date.parse(group.lastActivityAt || group.createdAt) || Date.now(),
        unreadCount: 0,
      });
      for (const s of selected) {
        await groupStore.upsertMember({
          groupId: group.id,
          userId: s.userId,
          username: s.username,
          role: "member",
          joinedAt: Date.now(),
          leftAt: null,
        });
      }
      const local = await identityStore.getLocalIdentity();
      if (local) {
        groupSenderKeyService.setLocalIdentity(local.userId, local.deviceId);
        await groupStore.upsertMember({
          groupId: group.id,
          userId: local.userId,
          username: local.username ?? "me",
          role: "admin",
          joinedAt: Date.now(),
          leftAt: null,
        });
        await groupSenderKeyService.rotateOwnSenderKey(group.id);
        for (const s of selected) {
          try {
            await groupSenderKeyService.sendGroupControl(group.id, "added", {
              subjectUserId: s.userId,
            });
          } catch {
            // best-effort
          }
        }
      }
      router.replace({
        pathname: "/GroupRoom" as never,
        params: { id: group.id, name: groupName.trim() },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen options={{ title: "Create group" }} />
      <ScreenTopAccent />
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <ThemedText style={styles.label}>Group name</ThemedText>
        <TextInput
          testID="create-group-name"
          style={[
            styles.input,
            {
              color: colors.text,
              borderColor: colors.surfaceBorder,
              backgroundColor: colors.surfaceElevated,
            },
          ]}
          value={groupName}
          onChangeText={setGroupName}
          placeholder="Friends"
          placeholderTextColor={colors.textMuted}
        />

        <ThemedText style={styles.label}>Add members</ThemedText>
        <TextInput
          testID="create-group-search"
          style={[
            styles.input,
            {
              color: colors.text,
              borderColor: colors.surfaceBorder,
              backgroundColor: colors.surfaceElevated,
            },
          ]}
          value={query}
          onChangeText={(t) => void search(t)}
          placeholder="Search username"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
        />

        <ThemedText style={styles.selected}>
          Selected: {selected.map((s) => s.username).join(", ") || "none"}
        </ThemedText>

        <FlatList
          data={results}
          keyExtractor={(i) => i.userId}
          style={styles.list}
          renderItem={({ item }) => (
            <ScalePressable
              testID={`pick-user-${item.username}`}
              onPress={() => toggle(item)}
              style={[
                styles.row,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.surfaceBorder,
                },
              ]}
            >
              <ThemedText>{item.username}</ThemedText>
            </ScalePressable>
          )}
        />

        {error ? (
          <ThemedText style={{ color: colors.error }}>{error}</ThemedText>
        ) : null}

        <ScalePressable
          testID="create-group-submit"
          disabled={!canSubmit}
          onPress={() => void createNewGroup()}
          style={[
            styles.submit,
            {
              backgroundColor: canSubmit ? colors.tint : colors.surfaceBorder,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.submitText}>Create group</ThemedText>
          )}
        </ScalePressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, padding: 16, gap: 10 },
  label: { fontWeight: "600", marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selected: { opacity: 0.8 },
  list: { flex: 1 },
  row: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  submit: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  submitText: { color: "#fff", fontWeight: "700" },
});
