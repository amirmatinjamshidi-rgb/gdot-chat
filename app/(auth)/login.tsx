import { type Href, Link, useRouter } from "expo-router";
import React, { useState } from "react";
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
import { loginUser } from "@/lib/auth/registration";
import { useAuth } from "@/lib/providers/auth-provider";
import { useAppServices } from "@/lib/services/app-services-context";

export default function LoginScreen() {
  const router = useRouter();
  const { refresh } = useAuth();
  const services = useAppServices();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    if (!username.trim() || !password) {
      Alert.alert("Error", "Enter username and password");
      return;
    }
    setLoading(true);
    try {
      await loginUser({
        username,
        password,
        authApi: services.authApi,
        authStore: services.authStore,
        kekManager: services.kekManager,
        db: services.db,
        identityStore: services.identityStore,
      });
      await refresh();
      router.replace("/lock" as Href);
    } catch (e) {
      Alert.alert(
        "Login failed",
        e instanceof Error ? e.message : "Unknown error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Gdot Chat
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
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <ScalePressable style={styles.button} onPress={() => void onLogin()}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.buttonText}>Sign in</ThemedText>
        )}
      </ScalePressable>
      <Link href={"/(auth)/register" as Href} asChild>
        <ScalePressable style={styles.link}>
          <ThemedText type="link">Create account</ThemedText>
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
