import { type Href, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TextInput,
  View,
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

/** Survives React Strict Mode remounts; keyed by lockEpoch. */
const handledAutoUnlockEpochs = new Set<number>();

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export default function LockScreen() {
  const router = useRouter();
  const { kekManager } = useAppServices();
  const { unlock, isUnlocked, dbReady, lockEpoch } = useAppLock();
  const [busy, setBusy] = useState(false);
  const [lockMode, setLockMode] = useState<LockMode | null>(null);
  const [pin, setPin] = useState("");
  const unlockInFlightRef = useRef(false);

  useEffect(() => {
    if (isUnlocked && dbReady) {
      router.replace("/(tabs)/chats" as Href);
    }
  }, [isUnlocked, dbReady, router]);

  const tryUnlock = useCallback(
    async (appPin?: string) => {
      if (unlockInFlightRef.current) return;
      unlockInFlightRef.current = true;
      setBusy(true);
      try {
        await yieldToUi();
        const result = await unlock(appPin);
        if (result.ok) {
          router.replace("/(tabs)/chats" as Href);
          return;
        }
        if (result.code === "USER_CANCEL") return;
        showUnlockAlert(result.code);
      } finally {
        unlockInFlightRef.current = false;
        setBusy(false);
      }
    },
    [unlock, router],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const mode = await kekManager.getLockMode();
      if (cancelled) return;
      setLockMode(mode);
      if (handledAutoUnlockEpochs.has(lockEpoch)) return;
      // Warm session after login/register: passphrase still cached (lock clears it
      // synchronously). Do not key off db.isOpen() — close() is async and races.
      if (kekManager.hasCachedPassphrase()) {
        handledAutoUnlockEpochs.add(lockEpoch);
        void tryUnlock();
        return;
      }
      if (mode === "pin") return;
      handledAutoUnlockEpochs.add(lockEpoch);
      void tryUnlock();
    })();
    return () => {
      cancelled = true;
    };
  }, [kekManager, lockEpoch, tryUnlock]);

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
          editable={!busy}
          value={pin}
          onChangeText={setPin}
        />
        <ScalePressable
          style={styles.button}
          disabled={busy}
          onPress={onPinUnlock}
        >
          {busy ? (
            <View style={styles.busyRow} accessibilityLabel="Securing your PIN…">
              <ActivityIndicator color="#fff" />
              <ThemedText style={styles.buttonText}>Securing your PIN…</ThemedText>
            </View>
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
        disabled={busy}
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
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
});
