import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ScalePressable } from "@/components/ui/scale-pressable";
import type { QuarantinedEnvelope } from "@/lib/db/envelope-quarantine-store";
import { useAppServices } from "@/lib/services/app-services-context";

/** Minimal UI hook for unknown-sender message requests. */
export default function MessageRequestsScreen() {
  const { syncService } = useAppServices();
  const router = useRouter();
  const [items, setItems] = useState<QuarantinedEnvelope[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setItems(await syncService.listMessageRequests());
  }, [syncService]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onAccept = async (id: string) => {
    setBusyId(id);
    try {
      await syncService.acceptMessageRequest(id);
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (id: string) => {
    setBusyId(id);
    try {
      await syncService.rejectMessageRequest(id);
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: "Message requests" }} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <ThemedText style={styles.empty}>No pending message requests.</ThemedText>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <ThemedText>
              {item.senderUsername ?? item.senderUserId ?? item.senderDeviceId}
            </ThemedText>
            <View style={styles.actions}>
              <ScalePressable
                style={styles.btn}
                disabled={busyId === item.id}
                onPress={() => void onAccept(item.id)}
              >
                <ThemedText>Accept</ThemedText>
              </ScalePressable>
              <ScalePressable
                style={styles.btn}
                disabled={busyId === item.id}
                onPress={() => void onReject(item.id)}
              >
                <ThemedText>Reject</ThemedText>
              </ScalePressable>
            </View>
          </View>
        )}
      />
      <ScalePressable style={styles.back} onPress={() => router.back()}>
        <ThemedText>Back</ThemedText>
      </ScalePressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  empty: { opacity: 0.7, marginTop: 24 },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#444",
  },
  actions: { flexDirection: "row", gap: 12, marginTop: 8 },
  btn: { padding: 8 },
  back: { marginTop: 16, padding: 12 },
});
