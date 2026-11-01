import { type Href, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { AppAuthError } from "@/lib/auth/app-auth-error";
import {
  peekPendingAppPinAuth,
  setPendingAppPinAuth,
  takePendingAppPinAuth,
} from "@/lib/auth/pending-app-pin-auth";
import { loginUser, registerUser } from "@/lib/auth/registration";
import type { LibSignalAdapter } from "@/lib/crypto/libsignal-adapter";
import {
  APP_PIN_MIN_LENGTH,
  validateAppPin,
} from "@/lib/crypto/pin-kek";
import { useAuth } from "@/lib/providers/auth-provider";
import { useAppServices } from "@/lib/services/app-services-context";

/** Let the spinner paint before the (still-heavy) registration work starts. */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export default function SetAppPinScreen() {
  const router = useRouter();
  const { refresh } = useAuth();
  const services = useAppServices();
  const pending = peekPendingAppPinAuth();
  const isCreate = pending?.kind === "register";

  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!peekPendingAppPinAuth()) {
      router.replace("/(auth)/login" as Href);
    }
  }, [router]);

  const onSubmit = async () => {
    const pendingAuth = takePendingAppPinAuth();
    if (!pendingAuth) {
      router.replace("/(auth)/login" as Href);
      return;
    }

    try {
      validateAppPin(pin);
    } catch (e) {
      setPendingAppPinAuth(pendingAuth);
      Alert.alert(
        "Invalid PIN",
        e instanceof Error ? e.message : "Check your app PIN",
      );
      return;
    }

    if (pendingAuth.kind === "register" && pin !== confirm) {
      setPendingAppPinAuth(pendingAuth);
      Alert.alert("PIN mismatch", "App PIN and confirmation do not match");
      return;
    }

    setLoading(true);
    await yieldToUi();
    try {
      if (pendingAuth.kind === "register") {
        await registerUser({
          username: pendingAuth.username,
          password: pendingAuth.password,
          deviceName: pendingAuth.deviceName,
          authApi: services.authApi,
          crypto: services.crypto as LibSignalAdapter,
          authStore: services.authStore,
          kekManager: services.kekManager,
          db: services.db,
          identityStore: services.identityStore,
          cryptoKeyStore: services.cryptoKeyStore,
          appPin: pin,
        });
      } else {
        await loginUser({
          username: pendingAuth.username,
          password: pendingAuth.password,
          authApi: services.authApi,
          authStore: services.authStore,
          kekManager: services.kekManager,
          db: services.db,
          identityStore: services.identityStore,
          appPin: pin,
        });
      }
      await refresh();
      router.replace("/lock" as Href);
    } catch (e) {
      setPendingAppPinAuth(pendingAuth);
      Alert.alert(
        pendingAuth.kind === "register" ? "Registration failed" : "Login failed",
        e instanceof AppAuthError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Unknown error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        {isCreate ? "Set app PIN" : "Enter app PIN"}
      </ThemedText>
      <ThemedText style={styles.sub}>
        {isCreate
          ? `No Strong fingerprint on this device. Choose an app PIN (at least ${APP_PIN_MIN_LENGTH} characters; letters and symbols allowed) to protect your encrypted database.`
          : "Enter the app PIN that protects your encrypted database on this device."}
      </ThemedText>
      <TextInput
        style={styles.input}
        placeholder={`App PIN (min ${APP_PIN_MIN_LENGTH})`}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={!loading}
        value={pin}
        onChangeText={setPin}
      />
      {isCreate ? (
        <TextInput
          style={styles.input}
          placeholder="Confirm app PIN"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
          value={confirm}
          onChangeText={setConfirm}
        />
      ) : null}
      <ScalePressable
        style={styles.button}
        disabled={loading}
        onPress={() => void onSubmit()}
      >
        {loading ? (
          <View style={styles.busyRow} accessibilityLabel="Securing your PIN…">
            <ActivityIndicator color="#fff" />
            <ThemedText style={styles.buttonText}>Securing your PIN…</ThemedText>
          </View>
        ) : (
          <ThemedText style={styles.buttonText}>
            {isCreate ? "Continue" : "Unlock"}
          </ThemedText>
        )}
      </ScalePressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  title: { marginBottom: 8 },
  sub: { opacity: 0.75, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#3B82F6",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
});
