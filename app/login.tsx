import { zodResolver } from "@hookform/resolvers/zod";
import { BlurView } from "expo-blur";

import { Redirect, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoginAmbientBackground } from "@/components/login-ambient-background";
import { ThemedText } from "@/components/themed-text";
import {
  formatPhoneAsYouType,
  getPhoneCountryInfo,
  normalizePhone,
} from "@/lib/auth/phone";
import {
  emailSchema,
  phoneSchema,
  type EmailInput,
  type PhoneInput,
} from "@/lib/auth/schemas";
import { useAuth } from "@/providers/auth-provider";
import { useThemePalette } from "@/providers/theme-palette-provider";

type LoginMode = "phone" | "email";

export default function LoginScreen() {
  const router = useRouter();
  const { isAuthenticated, isReady } = useAuth();
  const { colors, mode } = useThemePalette();
  const [loginMode, setLoginMode] = useState<LoginMode>("phone");
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);

  const phoneForm = useForm<PhoneInput>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "" },
    mode: "onTouched",
  });

  const emailForm = useForm<EmailInput>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
    mode: "onTouched",
  });

  const phoneValue = phoneForm.watch("phone");
  const countryInfo = useMemo(
    () => getPhoneCountryInfo(phoneValue),
    [phoneValue],
  );

  if (isReady && isAuthenticated) {
    return <Redirect href="/(tabs)/chats" />;
  }

  const onSubmitPhone = phoneForm.handleSubmit((data) => {
    router.push({
      pathname: "/verify-otp",
      params: {
        method: "phone",
        value: normalizePhone(data.phone),
      },
    });
  });

  const onSubmitEmail = emailForm.handleSubmit((data) => {
    router.push({
      pathname: "/verify-otp",
      params: {
        method: "email",
        value: data.email.trim().toLowerCase(),
      },
    });
  });

  const blurTint = mode === "dark" ? "dark" : "light";

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LoginAmbientBackground
        colors={{
          background: colors.background,
          backgroundSecondary: colors.backgroundSecondary,
          gradientStart: colors.gradientStart,
          gradientMid: colors.gradientMid,
          gradientEnd: colors.gradientEnd,
          primary: colors.primary,
          tint: colors.tint,
          accentGlow: colors.accentGlow,
        }}
      />

      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <View style={styles.container}>
            <View style={styles.hero}>
              <View
                style={[
                  styles.blockAccent,
                  { backgroundColor: colors.primary },
                ]}
              />
              <ThemedText
                type="title"
                style={[styles.wordmark, { color: colors.text }]}
                lightColor={colors.text}
                darkColor={colors.text}
              >
                Smash
              </ThemedText>
              <ThemedText
                style={[styles.tagline, { color: colors.textSecondary }]}
                lightColor={colors.textSecondary}
                darkColor={colors.textSecondary}
              >
                Sign in with your phone number or email. We will send a one-time
                code.
              </ThemedText>
            </View>

            <BlurView
              intensity={mode === "dark" ? 48 : 62}
              tint={blurTint}
              style={styles.blurShell}
            >
              <View
                style={[
                  styles.cardInner,
                  {
                    borderColor: colors.surfaceBorder,
                    backgroundColor:
                      Platform.OS === "ios" ? "transparent" : colors.surface,
                  },
                ]}
              >
                {loginMode === "phone" ? (
                  <>
                    {countryInfo ? (
                      <View style={styles.countryRow}>
                        <ThemedText
                          type="defaultSemiBold"
                          style={[styles.countryDial, { color: colors.text }]}
                          lightColor={colors.text}
                          darkColor={colors.text}
                        >
                          {countryInfo.callingCode
                            ? `+${countryInfo.callingCode}`
                            : ""}
                        </ThemedText>
                        <ThemedText
                          style={[
                            styles.countryText,
                            { color: colors.textMuted },
                          ]}
                          lightColor={colors.textMuted}
                          darkColor={colors.textMuted}
                        >
                          {countryInfo.name}
                        </ThemedText>
                      </View>
                    ) : null}
                    <Controller
                      control={phoneForm.control}
                      name="phone"
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                          keyboardType="phone-pad"
                          autoComplete="tel"
                          textContentType="telephoneNumber"
                          placeholder="+1 202 555 0101"
                          placeholderTextColor={colors.textMuted}
                          value={value}
                          onFocus={() => setPhoneFocused(true)}
                          onBlur={() => {
                            setPhoneFocused(false);
                            onBlur();
                          }}
                          onChangeText={(text) =>
                            onChange(formatPhoneAsYouType(text))
                          }
                          style={[
                            styles.input,
                            {
                              color: colors.text,
                              borderBottomColor: phoneForm.formState.errors
                                .phone
                                ? colors.error
                                : phoneFocused
                                  ? colors.inputBorderFocus
                                  : colors.inputBorder,
                              backgroundColor: colors.inputFill,
                            },
                          ]}
                        />
                      )}
                    />
                    <ThemedText
                      style={styles.errorText}
                      lightColor={colors.error}
                      darkColor={colors.error}
                    >
                      {phoneForm.formState.errors.phone?.message ?? " "}
                    </ThemedText>
                    <Pressable
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        { backgroundColor: colors.primary },
                        pressed && styles.pressedFade,
                      ]}
                      onPress={onSubmitPhone}
                    >
                      <ThemedText
                        style={[
                          styles.primaryBtnText,
                          { color: colors.onPrimary },
                        ]}
                        lightColor={colors.onPrimary}
                        darkColor={colors.onPrimary}
                      >
                        Send OTP
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [pressed && styles.pressedFade]}
                      onPress={() => setLoginMode("email")}
                    >
                      <ThemedText
                        type="link"
                        style={[styles.switchLink, { color: colors.link }]}
                        lightColor={colors.link}
                        darkColor={colors.link}
                      >
                        Login with email instead
                      </ThemedText>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Controller
                      control={emailForm.control}
                      name="email"
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                          keyboardType="email-address"
                          autoComplete="email"
                          autoCapitalize="none"
                          placeholder="you@example.com"
                          placeholderTextColor={colors.textMuted}
                          value={value}
                          onFocus={() => setEmailFocused(true)}
                          onBlur={() => {
                            setEmailFocused(false);
                            onBlur();
                          }}
                          onChangeText={onChange}
                          style={[
                            styles.input,
                            {
                              color: colors.text,
                              borderBottomColor: emailForm.formState.errors
                                .email
                                ? colors.error
                                : emailFocused
                                  ? colors.inputBorderFocus
                                  : colors.inputBorder,
                              backgroundColor: colors.inputFill,
                            },
                          ]}
                        />
                      )}
                    />
                    <ThemedText
                      style={styles.errorText}
                      lightColor={colors.error}
                      darkColor={colors.error}
                    >
                      {emailForm.formState.errors.email?.message ?? " "}
                    </ThemedText>
                    <Pressable
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        { backgroundColor: colors.primary },
                        pressed && styles.pressedFade,
                      ]}
                      onPress={onSubmitEmail}
                    >
                      <ThemedText
                        style={[
                          styles.primaryBtnText,
                          { color: colors.onPrimary },
                        ]}
                        lightColor={colors.onPrimary}
                        darkColor={colors.onPrimary}
                      >
                        Send OTP
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [pressed && styles.pressedFade]}
                      onPress={() => setLoginMode("phone")}
                    >
                      <ThemedText
                        type="link"
                        style={[styles.switchLink, { color: colors.link }]}
                        lightColor={colors.link}
                        darkColor={colors.link}
                      >
                        Login with phone instead
                      </ThemedText>
                    </Pressable>
                  </>
                )}
              </View>
            </BlurView>
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
    paddingHorizontal: 22,
    paddingTop: 12,
    justifyContent: "center",
    gap: 28,
  },
  hero: {
    gap: 12,
  },
  blockAccent: {
    width: 56,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  wordmark: {
    fontSize: 44,
    lineHeight: 48,
    fontWeight: "800",
    letterSpacing: -1.2,
  },
  tagline: {
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 340,
    opacity: 0.95,
  },
  blurShell: {
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
  },
  cardInner: {
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderWidth: 1,
    gap: 10,
  },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  countryDial: {
    fontSize: 14,
    minWidth: 40,
  },
  countryText: {
    fontSize: 13,
    flex: 1,
  },
  input: {
    borderBottomWidth: 2,
    borderRadius: 12,
    fontSize: 20,
    lineHeight: 26,
    paddingVertical: 14,
    paddingHorizontal: 14,
    letterSpacing: 0.12,
    marginTop: 4,
  },
  errorText: {
    minHeight: 18,
    fontSize: 12,
    lineHeight: 16,
  },
  primaryBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  primaryBtnText: {
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.3,
  },
  switchLink: {
    textAlign: "center",
    fontSize: 15,
    marginTop: 8,
    fontWeight: "600",
  },
  pressedFade: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
});
