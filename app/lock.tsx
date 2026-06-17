import { type Href, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useAppLock } from "@/lib/providers/app-lock-provider";

export default function LockScreen() {
  const router = useRouter();
  const { unlock, isUnlocked, dbReady } = useAppLock();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isUnlocked && dbReady) {
      router.replace("/(tabs)/chats" as Href);
    }
  }, [isUnlocked, dbReady, router]);

  useEffect(() => {
    void tryUnlock();
  }, []);

  const tryUnlock = async () => {
    setBusy(true);
    const ok = await unlock();
    setBusy(false);
    if (ok) {
      router.replace("/(tabs)/chats" as Href);
    } else {
      Alert.alert(
        "Unlock failed",
        "Use your fingerprint, face, or device PIN. On some phones you must enroll biometrics in system settings first.",
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ThemedText type="title">Locked</ThemedText>
      <ThemedText style={styles.sub}>
        Authenticate to open your encrypted database.
      </ThemedText>
      <ScalePressable style={styles.button} onPress={() => void tryUnlock()}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.buttonText}>Unlock</ThemedText>
        )}
      </ScalePressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
  sub: { opacity: 0.7, textAlign: "center" },
  button: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
    minWidth: 160,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600" },
});
