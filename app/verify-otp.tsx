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

import { ScreenTopAccent } from "@/components/screen-top-accent";
import { ThemedText } from "@/components/themed-text";
import { otpSchema, type OtpInput } from "@/lib/auth/schemas";
import { useAuth } from "@/providers/auth-provider";
import { useThemePalette } from "@/providers/theme-palette-provider";

type Params = {
  method?: "phone" | "email";
  value?: string;
};

const OTP_LEN = 6;

export default function VerifyOtpScreen() {
  const router = useRouter();
  const { method = "phone", value = "" } = useLocalSearchParams<Params>();
  const { signIn, isAuthenticated, isReady } = useAuth();
  const { colors } = useThemePalette();
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

  const idleBorder = colors.inputBorder;
  const ok = colors.success;
  const err = colors.error;

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const box0Style = useAnimatedStyle(() => ({
    borderColor:
      status === "error"
        ? err
        : progress.value >= 1
          ? ok
          : idleBorder,
    transform: [{ scale: scale0.value }],
  }), [status, err, ok, idleBorder]);

  const box1Style = useAnimatedStyle(() => ({
    borderColor:
      status === "error"
        ? err
        : progress.value >= 2
          ? ok
          : idleBorder,
    transform: [{ scale: scale1.value }],
  }), [status, err, ok, idleBorder]);

  const box2Style = useAnimatedStyle(() => ({
    borderColor:
      status === "error"
        ? err
        : progress.value >= 3
          ? ok
          : idleBorder,
    transform: [{ scale: scale2.value }],
  }), [status, err, ok, idleBorder]);

  const box3Style = useAnimatedStyle(() => ({
    borderColor:
      status === "error"
        ? err
        : progress.value >= 4
          ? ok
          : idleBorder,
    transform: [{ scale: scale3.value }],
  }), [status, err, ok, idleBorder]);

  const box4Style = useAnimatedStyle(() => ({
    borderColor:
      status === "error"
        ? err
        : progress.value >= 5
          ? ok
          : idleBorder,
    transform: [{ scale: scale4.value }],
  }), [status, err, ok, idleBorder]);

  const box5Style = useAnimatedStyle(() => ({
    borderColor:
      status === "error"
        ? err
        : progress.value >= 6
          ? ok
          : idleBorder,
    transform: [{ scale: scale5.value }],
  }), [status, err, ok, idleBorder]);

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

  const boxFill = colors.surfaceElevated;

  return (
    <View style={styles.root}>
      <ScreenTopAccent />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <View style={styles.container}>
            <View style={styles.header}>
              <ThemedText
                type="title"
                style={[styles.title, { color: colors.text }]}
                lightColor={colors.text}
                darkColor={colors.text}
              >
                Enter code
              </ThemedText>
              <ThemedText
                style={[styles.subtitle, { color: colors.textSecondary }]}
                lightColor={colors.textSecondary}
                darkColor={colors.textSecondary}
              >
                We sent a 6-digit code to {maskedTarget}
              </ThemedText>
            </View>

            <Pressable
              style={({ pressed }) => [pressed && styles.pressedFade]}
              onPress={() => inputRef.current?.focus()}
            >
              <Animated.View style={[styles.boxRow, shakeStyle]}>
                {(
                  [
                    box0Style,
                    box1Style,
                    box2Style,
                    box3Style,
                    box4Style,
                    box5Style,
                  ] as const
                ).map((st, i) => (
                  <Animated.View
                    key={i}
                    style={[styles.box, { backgroundColor: boxFill }, st]}
                  >
                    <ThemedText
                      style={[styles.boxText, { color: colors.text }]}
                      lightColor={colors.text}
                      darkColor={colors.text}
                    >
                      {otp[i] ?? ""}
                    </ThemedText>
                  </Animated.View>
                ))}
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
              <ThemedText
                style={[styles.errorText, { color: colors.error }]}
                lightColor={colors.error}
                darkColor={colors.error}
              >
                Wrong code, try again
              </ThemedText>
            ) : (
              <View style={styles.errorSpacer} />
            )}

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: colors.primary },
                submitting && styles.btnDisabled,
                pressed && styles.pressedFade,
              ]}
              onPress={() => void onSubmit()}
              disabled={submitting}
            >
              <ThemedText
                style={[styles.primaryBtnText, { color: colors.onPrimary }]}
                lightColor={colors.onPrimary}
                darkColor={colors.onPrimary}
              >
                {submitting ? "Checking..." : "Verify"}
              </ThemedText>
            </Pressable>

            <Pressable
              style={({ pressed }) => [pressed && styles.pressedFade]}
              onPress={() => router.replace("/login")}
            >
              <ThemedText
                style={[styles.linkText, { color: colors.link }]}
                lightColor={colors.link}
                darkColor={colors.link}
              >
                Use another phone/email
              </ThemedText>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    gap: 22,
  },
  header: {
    gap: 8,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.92,
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
    fontWeight: "800",
    letterSpacing: 1,
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    width: 1,
    height: 1,
  },
  errorText: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
  errorSpacer: {
    height: 20,
  },
  primaryBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    fontWeight: "800",
    fontSize: 16,
  },
  linkText: {
    textAlign: "center",
    fontSize: 15,
    fontWeight: "600",
  },
  pressedFade: {
    opacity: 0.72,
  },
});
