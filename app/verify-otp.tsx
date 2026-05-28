import { zodResolver } from "@hookform/resolvers/zod";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { otpSchema, type OtpInput } from "@/lib/auth/schemas";
import { useAuth } from "@/providers/auth-provider";

type Params = {
  method?: "phone" | "email";
  value?: string;
};

const OTP_LEN = 6;

export default function VerifyOtpScreen() {
  const router = useRouter();
  const { method = "phone", value = "" } = useLocalSearchParams<Params>();
  const { signIn, isAuthenticated, isReady } = useAuth();
  const isDark = (useColorScheme() ?? "light") === "dark";
  const inputRef = useRef<TextInput>(null);
  const [status, setStatus] = useState<"idle" | "error" | "success">("idle");
  const [submitting, setSubmitting] = useState(false);

  const shakeX = useSharedValue(0);
  const progress = useSharedValue(0);
  const scale0 = useSharedValue(1);
  const scale1 = useSharedValue(1);
  const scale2 = useSharedValue(1);
  const scale3 = useSharedValue(1);
  const scale4 = useSharedValue(1);
  const scale5 = useSharedValue(1);

  const { control, handleSubmit, watch, setValue } = useForm<OtpInput>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: "" },
    mode: "onTouched",
  });

  const otp = watch("otp");
  const maskedTarget = useMemo(() => {
    if (!value) return "";
    if (method === "email") {
      const [name, domain] = value.split("@");
      if (!domain) return value;
      return `${name.slice(0, 2)}***@${domain}`;
    }
    return `${value.slice(0, 4)}***${value.slice(-2)}`;
  }, [method, value]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const box0Style = useAnimatedStyle(() => ({
    borderColor:
      status === "error"
        ? "#EF4444"
        : progress.value >= 1
          ? "#22C55E"
          : isDark
            ? "#334155"
            : "#CBD5E1",
    transform: [{ scale: scale0.value }],
  }));

  const box1Style = useAnimatedStyle(() => ({
    borderColor:
      status === "error"
        ? "#EF4444"
        : progress.value >= 2
          ? "#22C55E"
          : isDark
            ? "#334155"
            : "#CBD5E1",
    transform: [{ scale: scale1.value }],
  }));

  const box2Style = useAnimatedStyle(() => ({
    borderColor:
      status === "error"
        ? "#EF4444"
        : progress.value >= 3
          ? "#22C55E"
          : isDark
            ? "#334155"
            : "#CBD5E1",
    transform: [{ scale: scale2.value }],
  }));

  const box3Style = useAnimatedStyle(() => ({
    borderColor:
      status === "error"
        ? "#EF4444"
        : progress.value >= 4
          ? "#22C55E"
          : isDark
            ? "#334155"
            : "#CBD5E1",
    transform: [{ scale: scale3.value }],
  }));

  const box4Style = useAnimatedStyle(() => ({
    borderColor:
      status === "error"
        ? "#EF4444"
        : progress.value >= 5
          ? "#22C55E"
          : isDark
            ? "#334155"
            : "#CBD5E1",
    transform: [{ scale: scale4.value }],
  }));

  const box5Style = useAnimatedStyle(() => ({
    borderColor:
      status === "error"
        ? "#EF4444"
        : progress.value >= 6
          ? "#22C55E"
          : isDark
            ? "#334155"
            : "#CBD5E1",
    transform: [{ scale: scale5.value }],
  }));

  if (!value) {
    return <Redirect href="/login" />;
  }

  if (isReady && isAuthenticated) {
    return <Redirect href="/(tabs)/chats" />;
  }

  const runErrorAnimation = () => {
    setStatus("error");
    progress.value = 0;
    shakeX.value = withSequence(
      withTiming(-10, { duration: 40 }),
      withTiming(10, { duration: 40 }),
      withTiming(-8, { duration: 35 }),
      withTiming(8, { duration: 35 }),
      withTiming(0, { duration: 35 }),
    );
  };

  const runSuccessAnimation = async () => {
    setStatus("success");
    progress.value = 0;
    progress.value = 1;
    scale0.value = withSequence(
      withTiming(1.14, { duration: 90 }),
      withSpring(1, { damping: 10, stiffness: 240 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 70));
    progress.value = 2;
    scale1.value = withSequence(
      withTiming(1.14, { duration: 90 }),
      withSpring(1, { damping: 10, stiffness: 240 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 70));
    progress.value = 3;
    scale2.value = withSequence(
      withTiming(1.14, { duration: 90 }),
      withSpring(1, { damping: 10, stiffness: 240 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 70));
    progress.value = 4;
    scale3.value = withSequence(
      withTiming(1.14, { duration: 90 }),
      withSpring(1, { damping: 10, stiffness: 240 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 70));
    progress.value = 5;
    scale4.value = withSequence(
      withTiming(1.14, { duration: 90 }),
      withSpring(1, { damping: 10, stiffness: 240 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 70));
    progress.value = 6;
    scale5.value = withSequence(
      withTiming(1.14, { duration: 90 }),
      withSpring(1, { damping: 10, stiffness: 240 }),
    );
  };

  const onSubmit = handleSubmit(async ({ otp: code }) => {
    setSubmitting(true);
    setStatus("idle");
    try {
      // Mock verification for now. Replace with API call later.
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (code !== "123456") {
        runErrorAnimation();
        return;
      }
      await runSuccessAnimation();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await signIn(method, value);
      router.replace("/(tabs)/chats");
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ThemedView style={styles.container}>
          <View style={styles.header}>
            <ThemedText type="title" style={styles.title}>
              Enter code
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              We sent a 6-digit code to {maskedTarget}
            </ThemedText>
          </View>

          <Pressable
            style={({ pressed }) => [pressed && styles.pressedFade]}
            onPress={() => inputRef.current?.focus()}
          >
            <Animated.View style={[styles.boxRow, shakeStyle]}>
              <Animated.View
                style={[
                  styles.box,
                  { backgroundColor: isDark ? "#0B1220" : "#FFFFFF" },
                  box0Style,
                ]}
              >
                <ThemedText style={styles.boxText}>{otp[0] ?? ""}</ThemedText>
              </Animated.View>
              <Animated.View
                style={[
                  styles.box,
                  { backgroundColor: isDark ? "#0B1220" : "#FFFFFF" },
                  box1Style,
                ]}
              >
                <ThemedText style={styles.boxText}>{otp[1] ?? ""}</ThemedText>
              </Animated.View>
              <Animated.View
                style={[
                  styles.box,
                  { backgroundColor: isDark ? "#0B1220" : "#FFFFFF" },
                  box2Style,
                ]}
              >
                <ThemedText style={styles.boxText}>{otp[2] ?? ""}</ThemedText>
              </Animated.View>
              <Animated.View
                style={[
                  styles.box,
                  { backgroundColor: isDark ? "#0B1220" : "#FFFFFF" },
                  box3Style,
                ]}
              >
                <ThemedText style={styles.boxText}>{otp[3] ?? ""}</ThemedText>
              </Animated.View>
              <Animated.View
                style={[
                  styles.box,
                  { backgroundColor: isDark ? "#0B1220" : "#FFFFFF" },
                  box4Style,
                ]}
              >
                <ThemedText style={styles.boxText}>{otp[4] ?? ""}</ThemedText>
              </Animated.View>
              <Animated.View
                style={[
                  styles.box,
                  { backgroundColor: isDark ? "#0B1220" : "#FFFFFF" },
                  box5Style,
                ]}
              >
                <ThemedText style={styles.boxText}>{otp[5] ?? ""}</ThemedText>
              </Animated.View>
            </Animated.View>
          </Pressable>

          <Controller
            control={control}
            name="otp"
            render={({ field: { onChange, value: formValue } }) => (
              <TextInput
                ref={inputRef}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                value={formValue}
                onChangeText={(text) => {
                  const next = text.replace(/\D/g, "").slice(0, OTP_LEN);
                  onChange(next);
                  if (status !== "idle") setStatus("idle");
                  if (next.length === OTP_LEN && !submitting) {
                    setValue("otp", next, { shouldValidate: true });
                    void onSubmit();
                  }
                }}
                style={styles.hiddenInput}
              />
            )}
          />

          {status === "error" ? (
            <ThemedText style={styles.errorText}>Wrong code, try again</ThemedText>
          ) : (
            <View style={styles.errorSpacer} />
          )}

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              submitting && styles.btnDisabled,
              pressed && styles.pressedFade,
            ]}
            onPress={() => void onSubmit()}
            disabled={submitting}
          >
            <ThemedText style={styles.primaryBtnText}>
              {submitting ? "Checking..." : "Verify"}
            </ThemedText>
          </Pressable>

          <Pressable
            style={({ pressed }) => [pressed && styles.pressedFade]}
            onPress={() => router.replace("/login")}
          >
            <ThemedText style={styles.linkText}>Use another phone/email</ThemedText>
          </Pressable>
        </ThemedView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 28,
    gap: 22,
  },
  header: {
    gap: 8,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
  },
  subtitle: {
    opacity: 0.7,
    fontSize: 14,
    lineHeight: 20,
  },
  boxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 8,
  },
  box: {
    flex: 1,
    height: 64,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  boxText: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    letterSpacing: 1,
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    width: 1,
    height: 1,
  },
  errorText: {
    color: "#EF4444",
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
  errorSpacer: {
    height: 20,
  },
  primaryBtn: {
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3B82F6",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  linkText: {
    textAlign: "center",
    color: "#3B82F6",
    fontSize: 14,
  },
  pressedFade: {
    opacity: 0.72,
  },
});
