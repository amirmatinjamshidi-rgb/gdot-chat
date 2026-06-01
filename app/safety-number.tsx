import { Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useAppServices } from "@/lib/services/app-services-context";

export default function SafetyNumberScreen() {
  const { peerUserId, peerDeviceId } = useLocalSearchParams<{
    peerUserId: string;
    peerDeviceId: string;
  }>();
  const { signalService, identityStore } = useAppServices();
  const [formatted, setFormatted] = useState("…");

  useEffect(() => {
    if (!peerUserId || !peerDeviceId) return;
    void signalService
      .getSafetyNumber(peerUserId, peerDeviceId)
      .then((sn) => {
        setFormatted(sn.replace(/(.{5})/g, "$1 ").trim());
      });
  }, [peerUserId, peerDeviceId, signalService]);

  const onVerify = async () => {
    if (!peerDeviceId) return;
    await identityStore.setVerified(peerDeviceId, true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: "Safety number" }} />
      <ThemedText type="subtitle">Verify with your contact in person</ThemedText>
      <View style={styles.codeBox}>
        <ThemedText style={styles.code}>{formatted}</ThemedText>
      </View>
      <ScalePressable style={styles.button} onPress={() => void onVerify()}>
        <ThemedText style={styles.buttonText}>Mark verified</ThemedText>
      </ScalePressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 16 },
  codeBox: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(59,130,246,0.12)",
  },
  code: { fontSize: 18, fontFamily: "monospace", lineHeight: 28 },
  button: {
    backgroundColor: "#10B981",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600" },
});
