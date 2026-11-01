import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ScalePressable } from "@/components/ui/scale-pressable";
import type { GroupMember } from "@/lib/api/groups-api";
import { useAppServices } from "@/lib/services/app-services-context";
import { useColors } from "@/stores/theme-store";

export default function GroupInfoScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { syncService, groupsApi } = useAppServices();
  const colors = useColors();
  const router = useRouter();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      setMembers(await groupsApi.listMembers(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [groupsApi, id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: name ? `${name} info` : "Group info" }} />
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <ThemedText style={styles.heading}>Members</ThemedText>
        <FlatList
          testID="group-members-list"
          data={members.filter((m) => !m.leftAt)}
          keyExtractor={(m) => m.userId}
          renderItem={({ item }) => (
            <View
              style={[
                styles.row,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.surfaceBorder,
                },
              ]}
            >
              <ThemedText>
                {item.username} · {item.role}
              </ThemedText>
              <ScalePressable
                testID={`remove-member-${item.username}`}
                onPress={() => {
                  void (async () => {
                    try {
                      try {
                        await syncService.sendGroupControl(id!, "removed", {
                          subjectUserId: item.userId,
                        });
                      } catch {
                        // best-effort authenticated notice before membership cut
                      }
                      await groupsApi.removeMember(id!, item.userId);
                      await refresh();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    }
                  })();
                }}
              >
                <ThemedText style={{ color: colors.error }}>Remove</ThemedText>
              </ScalePressable>
            </View>
          )}
        />
        {error ? (
          <ThemedText style={{ color: colors.error }}>{error}</ThemedText>
        ) : null}
        <ScalePressable
          testID="leave-group"
          onPress={() => {
            void (async () => {
              try {
                await syncService.sendGroupControl(id!, "left");
              } catch {
                // best-effort
              }
              await groupsApi.leave(id!);
              router.replace("/(tabs)/chats");
            })();
          }}
          style={[styles.leave, { borderColor: colors.error }]}
        >
          <ThemedText style={{ color: colors.error, fontWeight: "700" }}>
            Leave group
          </ThemedText>
        </ScalePressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: "700" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  leave: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
});
