import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useAppServices } from "@/lib/services/app-services-context";

export default function SafetyNumberScreen() {
  const router = useRouter();
  const { peerUserId, peerDeviceId } = useLocalSearchParams<{
    peerUserId: string;
    peerDeviceId: string;
  }>();
  const { signalService, syncService } = useAppServices();
  const [formatted, setFormatted] = useState("…");
  const [keyChanged, setKeyChanged] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!peerUserId || !peerDeviceId) return;
    void (async () => {
      const sn = await signalService.getSafetyNumber(peerUserId, peerDeviceId);
      setFormatted(sn.replace(/(.{5})/g, "$1 ").trim());
      const trust = await signalService.getIdentityTrust(peerUserId);
      setKeyChanged(trust.keyChanged);
    })();
  }, [peerUserId, peerDeviceId, signalService]);

  const onAccept = async (markVerified: boolean) => {
    if (!peerUserId) return;
    setBusy(true);
    try {
      await signalService.acceptNewIdentityKey(peerUserId, { markVerified });
      await syncService.retryIdentityQuarantine(peerUserId);
      setKeyChanged(false);
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: "Safety number" }} />
      {keyChanged ? (
        <ThemedText type="subtitle" style={styles.warn}>
          This contact&apos;s identity key changed. Confirm the safety number
          with them in person before trusting messages again.
        </ThemedText>
      ) : (
        <ThemedText type="subtitle">
          Verify with your contact in person
        </ThemedText>
      )}
      <View style={styles.codeBox}>
        <ThemedText style={styles.code}>{formatted}</ThemedText>
      </View>
      {keyChanged ? (
        <>
          <ScalePressable
            style={[styles.button, styles.accept]}
            disabled={busy}
            onPress={() => void onAccept(false)}
          >
            <ThemedText style={styles.buttonText}>Accept new key</ThemedText>
          </ScalePressable>
          <ScalePressable
            style={styles.button}
            disabled={busy}
            onPress={() => void onAccept(true)}
          >
            <ThemedText style={styles.buttonText}>
              Accept and mark verified
            </ThemedText>
          </ScalePressable>
        </>
      ) : (
        <ScalePressable
          style={styles.button}
          disabled={busy}
          onPress={() => void onAccept(true)}
        >
          <ThemedText style={styles.buttonText}>Mark verified</ThemedText>
        </ScalePressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 16 },
  warn: { color: "#B45309" },
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
  accept: { backgroundColor: "#D97706" },
  buttonText: { color: "#fff", fontWeight: "600" },
});
