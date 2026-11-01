import { type Href, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ScalePressable } from "@/components/ui/scale-pressable";
import {
  type AppAuthErrorCode,
  messageForAppAuthCode,
} from "@/lib/auth/app-auth-error";
import { APP_PIN_MIN_LENGTH } from "@/lib/crypto/pin-kek";
import type { LockMode } from "@/lib/db/kek-manager";
import { useAppLock } from "@/lib/providers/app-lock-provider";
import { useAppServices } from "@/lib/services/app-services-context";

export default function LockScreen() {
  const router = useRouter();
  const { kekManager } = useAppServices();
  const { unlock, isUnlocked, dbReady } = useAppLock();
  const [busy, setBusy] = useState(false);
  const [lockMode, setLockMode] = useState<LockMode | null>(null);
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (isUnlocked && dbReady) {
      router.replace("/(tabs)/chats" as Href);
    }
  }, [isUnlocked, dbReady, router]);

  useEffect(() => {
    void (async () => {
      const mode = await kekManager.getLockMode();
      setLockMode(mode);
      if (mode !== "pin") {
        void tryUnlock();
      }
    })();
  }, []);

  const tryUnlock = async (appPin?: string) => {
    setBusy(true);
    const result = await unlock(appPin);
    setBusy(false);
    if (result.ok) {
      router.replace("/(tabs)/chats" as Href);
      return;
    }
    if (result.code === "USER_CANCEL") return;
    showUnlockAlert(result.code);
  };

  const onPinUnlock = () => {
    if (pin.length < APP_PIN_MIN_LENGTH) {
      Alert.alert(
        "Invalid PIN",
        `App PIN must be at least ${APP_PIN_MIN_LENGTH} characters`,
      );
      return;
    }
    void tryUnlock(pin);
  };

  if (lockMode === null) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (lockMode === "pin") {
    return (
      <SafeAreaView style={styles.container}>
        <ThemedText type="title">Locked</ThemedText>
        <ThemedText style={styles.sub}>
          Enter your app PIN to open your encrypted database.
        </ThemedText>
        <TextInput
          style={styles.input}
          placeholder={`App PIN (min ${APP_PIN_MIN_LENGTH})`}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          value={pin}
          onChangeText={setPin}
        />
        <ScalePressable style={styles.button} onPress={onPinUnlock}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.buttonText}>Unlock</ThemedText>
          )}
        </ScalePressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ThemedText type="title">Locked</ThemedText>
      <ThemedText style={styles.sub}>
        Authenticate to open your encrypted database.
      </ThemedText>
      <ScalePressable
        style={styles.button}
        onPress={() => void tryUnlock()}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.buttonText}>Unlock</ThemedText>
        )}
      </ScalePressable>
    </SafeAreaView>
  );
}

function showUnlockAlert(code: AppAuthErrorCode) {
  const title =
    code === "STRONG_BIOMETRIC_REQUIRED"
      ? "Fingerprint required"
      : code === "NOT_ENROLLED"
        ? "Biometrics not set up"
        : code === "PIN_REQUIRED" || code === "PIN_INVALID"
          ? "App PIN required"
          : "Unlock failed";
  Alert.alert(title, messageForAppAuthCode(code));
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
  input: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
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
