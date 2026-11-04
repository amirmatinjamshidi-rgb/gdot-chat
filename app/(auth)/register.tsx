import { type Href, Link, useRouter } from "expo-router";
import React, { useState } from "react";
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
  AppAuthError,
  type AppAuthErrorCode,
} from "@/lib/auth/app-auth-error";
import { setPendingAppPinAuth } from "@/lib/auth/pending-app-pin-auth";
import { registerUser } from "@/lib/auth/registration";
import type { LibSignalAdapter } from "@/lib/crypto/libsignal-adapter";
import { useAppLock } from "@/lib/providers/app-lock-provider";
import { useAuth } from "@/lib/providers/auth-provider";
import { useAppServices } from "@/lib/services/app-services-context";

function authErrorCode(error: unknown): AppAuthErrorCode | null {
  if (error instanceof AppAuthError) return error.code;
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: unknown }).code) as AppAuthErrorCode;
  }
  return null;
}

export default function RegisterScreen() {
  const router = useRouter();
  const { refresh } = useAuth();
  const { unlock, beginSuppressBackgroundLock, endSuppressBackgroundLock } = useAppLock();
  const services = useAppServices();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onRegister = async () => {
    if (!username.trim() || password.length < 8) {
      Alert.alert("Error", "Username required and password min 8 characters");
      return;
    }
    setLoading(true);
    beginSuppressBackgroundLock();
    try {
      await registerUser({
        username,
        password,
        deviceName: "Mobile",
        authApi: services.authApi,
        crypto: services.crypto as LibSignalAdapter,
        authStore: services.authStore,
        kekManager: services.kekManager,
        db: services.db,
        identityStore: services.identityStore,
        cryptoKeyStore: services.cryptoKeyStore,
      });
      await refresh();
      // Mark session unlocked so /lock does not prompt again.
      await unlock();
      router.replace("/lock" as Href);
    } catch (e) {
      const code = authErrorCode(e);
      if (
        code === "PIN_REQUIRED" ||
        code === "NOT_ENROLLED" ||
        code === "STRONG_BIOMETRIC_REQUIRED"
      ) {
        setPendingAppPinAuth({
          kind: "register",
          username,
          password,
          deviceName: "Mobile",
        });
        router.push("/(auth)/set-app-pin" as Href);
        return;
      }
      Alert.alert(
        "Registration failed",
        e instanceof Error ? e.message : "Unknown error",
      );
    } finally {
      endSuppressBackgroundLock();
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Create account
      </ThemedText>
      <TextInput
        style={styles.input}
        placeholder="Username"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="Password (min 8)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <ScalePressable style={styles.button} onPress={() => void onRegister()}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.buttonText}>Register</ThemedText>
        )}
      </ScalePressable>
      <Link href={"/(auth)/login" as Href} asChild>
        <ScalePressable style={styles.link}>
          <ThemedText type="link">Already have an account?</ThemedText>
        </ScalePressable>
      </Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  title: { marginBottom: 16 },
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
  buttonText: { color: "#fff", fontWeight: "600" },
  link: { marginTop: 16, alignItems: "center" },
});
