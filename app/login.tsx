import { zodResolver } from "@hookform/resolvers/zod";
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

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
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

type LoginMode = "phone" | "email";

export default function LoginScreen() {
  const router = useRouter();
  const { isAuthenticated, isReady } = useAuth();
  const [mode, setMode] = useState<LoginMode>("phone");
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const isDark = (useColorScheme() ?? "light") === "dark";

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

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ThemedView style={styles.container}>
          <View style={styles.header}>
            <ThemedText type="title" style={styles.title}>
              Log in to Smash
            </ThemedText>
          </View>

          <View style={styles.card}>
            {/* <View style={styles.switchRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.switchBtn,
                  mode === "phone" && styles.switchBtnActive,
                  pressed && styles.pressedFade,
                ]}
                onPress={() => setMode("phone")}
              >
                <ThemedText
                  style={[
                    styles.switchText,
                    mode === "phone" && styles.switchTextActive,
                  ]}
                >
                  Phone
                </ThemedText>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.switchBtn,
                  mode === "email" && styles.switchBtnActive,
                  pressed && styles.pressedFade,
                ]}
                onPress={() => setMode("email")}
              >
                <ThemedText
                  style={[
                    styles.switchText,
                    mode === "email" && styles.switchTextActive,
                  ]}
                >
                  Email
                </ThemedText>
              </Pressable>
            </View> */}

            {mode === "phone" ? (
              <>
                {countryInfo ? (
                  <View style={styles.countryRow}>
                    <ThemedText style={styles.countryFlag}>
                      {countryInfo.flag}
                    </ThemedText>
                    <ThemedText style={styles.countryText}>
                      {countryInfo.name}
                      {countryInfo.callingCode
                        ? ` (+${countryInfo.callingCode})`
                        : ""}
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
                      placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
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
                        styles.telegramInput,
                        {
                          color: isDark ? "#F8FAFC" : "#0F172A",
                          borderColor: phoneForm.formState.errors.phone
                            ? "#EF4444"
                            : phoneFocused
                              ? "#229ED9"
                              : isDark
                                ? "#334155"
                                : "#CBD5E1",
                        },
                      ]}
                    />
                  )}
                />
                <ThemedText style={styles.errorText}>
                  {phoneForm.formState.errors.phone?.message ?? " "}
                </ThemedText>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.pressedFade,
                  ]}
                  onPress={onSubmitPhone}
                >
                  <ThemedText style={styles.primaryBtnText}>
                    Send OTP
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [pressed && styles.pressedFade]}
                  onPress={() => setMode("email")}
                >
                  <ThemedText style={styles.switchLink}>
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
                      placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
                      value={value}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => {
                        setEmailFocused(false);
                        onBlur();
                      }}
                      onChangeText={onChange}
                      style={[
                        styles.telegramInput,
                        {
                          color: isDark ? "#F8FAFC" : "#0F172A",
                          borderColor: emailForm.formState.errors.email
                            ? "#EF4444"
                            : emailFocused
                              ? "#229ED9"
                              : isDark
                                ? "#334155"
                                : "#CBD5E1",
                        },
                      ]}
                    />
                  )}
                />
                <ThemedText style={styles.errorText}>
                  {emailForm.formState.errors.email?.message ?? " "}
                </ThemedText>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.pressedFade,
                  ]}
                  onPress={onSubmitEmail}
                >
                  <ThemedText style={styles.primaryBtnText}>
                    Send OTP
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [pressed && styles.pressedFade]}
                  onPress={() => setMode("phone")}
                >
                  <ThemedText style={styles.switchLink}>
                    Login with phone instead
                  </ThemedText>
                </Pressable>
              </>
            )}
          </View>
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
    paddingTop: 24,
    gap: 20,
  },
  header: {
    gap: 8,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
  },
  card: {
    paddingVertical: 8,
    gap: 10,
  },
  switchRow: {
    flexDirection: "row",
    backgroundColor: "rgba(148,163,184,0.15)",
    borderRadius: 14,
    padding: 3,
    marginBottom: 6,
  },
  switchBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 11,
  },
  switchBtnActive: {
    backgroundColor: "#3B82F6",
  },
  switchText: {
    fontSize: 14,
    opacity: 0.8,
  },
  switchTextActive: {
    color: "#FFFFFF",
    opacity: 1,
    fontWeight: "700",
  },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  countryFlag: {
    fontSize: 18,
    lineHeight: 24,
  },
  countryText: {
    opacity: 0.8,
    fontSize: 13,
  },
  telegramInput: {
    borderBottomWidth: 2,
    borderRadius: 0,
    fontSize: 22,
    lineHeight: 28,
    paddingVertical: 14,
    paddingHorizontal: 2,
    letterSpacing: 0.15,
    backgroundColor: "transparent",
  },
  errorText: {
    minHeight: 18,
    color: "#EF4444",
    fontSize: 12,
    lineHeight: 16,
  },
  primaryBtn: {
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#229ED9",
    marginTop: 2,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  switchLink: {
    textAlign: "center",
    color: "#229ED9",
    fontSize: 14,
    marginTop: 4,
  },
  pressedFade: {
    opacity: 0.72,
  },
});
