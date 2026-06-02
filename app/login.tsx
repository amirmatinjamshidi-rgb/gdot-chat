import { zodResolver } from "@hookform/resolvers/zod";
import { BlurView } from "expo-blur";

import { Redirect, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  buildE164FromParts,
  formatNationalAsYouType,
  getCountryInfoFromCallingCodeDigits,
  sanitizeCallingCodeDigits,
  shouldAdvanceToNationalNumber,
} from "@/lib/auth/phone";
import {
  emailSchema,
  phonePartsSchema,
  type EmailInput,
  type PhonePartsInput,
} from "@/lib/auth/schemas";
import { useAuthStore } from "@/stores/auth-store";
import { useThemeStore } from "@/stores/theme-store";

type LoginMode = "phone" | "email";

export default function LoginScreen() {
  const router = useRouter();
  const { isAuthenticated, isReady } = useAuthStore();
  const colors = useThemeStore((state) => state.colors);
  const mode = useThemeStore((state) => state.mode);
  const [loginMode, setLoginMode] = useState<LoginMode>("phone");
  const [callingFocused, setCallingFocused] = useState(false);
  const [nationalFocused, setNationalFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const nationalInputRef = useRef<TextInput>(null);
  const callingInputRef = useRef<TextInput>(null);
  const wasCallingCompleteRef = useRef(false);

  const phoneForm = useForm<PhonePartsInput>({
    resolver: zodResolver(phonePartsSchema),
    defaultValues: { callingCodeDigits: "", nationalNumber: "" },
    mode: "onTouched",
  });

  const emailForm = useForm<EmailInput>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
    mode: "onTouched",
  });

  const callingDigits = phoneForm.watch("callingCodeDigits");
  const countryInfo = useMemo(
    () => getCountryInfoFromCallingCodeDigits(callingDigits),
    [callingDigits],
  );

  const prevCountryIsoRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const clean = sanitizeCallingCodeDigits(callingDigits);
    if (!clean) {
      prevCountryIsoRef.current = undefined;
      wasCallingCompleteRef.current = false;
      phoneForm.setValue("nationalNumber", "");
      return;
    }
    const info = getCountryInfoFromCallingCodeDigits(clean);
    if (!info) return;
    const iso = info.countryCode;
    if (prevCountryIsoRef.current && prevCountryIsoRef.current !== iso) {
      phoneForm.setValue("nationalNumber", "");
    }
    prevCountryIsoRef.current = iso;
  }, [callingDigits, phoneForm]);

  if (isReady && isAuthenticated) {
    return <Redirect href="/(tabs)/chats" />;
  }

  const onSubmitPhone = phoneForm.handleSubmit((data) => {
    const e164 = buildE164FromParts(
      data.callingCodeDigits,
      data.nationalNumber,
    );
    if (!e164) return;
    router.push({
      pathname: "/verify-otp",
      params: {
        method: "phone",
        value: e164,
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
                    <ThemedText
                      style={[styles.fieldLabel, { color: colors.textMuted }]}
                      lightColor={colors.textMuted}
                      darkColor={colors.textMuted}
                    >
                      Country code
                    </ThemedText>
                    <View style={styles.phoneSplitRow}>
                      <View
                        style={[
                          styles.callingShell,
                          {
                            borderColor: phoneForm.formState.errors
                              .callingCodeDigits
                              ? colors.error
                              : callingFocused
                                ? colors.inputBorderFocus
                                : colors.inputBorder,
                            backgroundColor: colors.inputFill,
                          },
                        ]}
                      >
                        <ThemedText
                          type="defaultSemiBold"
                          style={[styles.callingPlus, { color: colors.text }]}
                          lightColor={colors.text}
                          darkColor={colors.text}
                        >
                          +
                        </ThemedText>
                        <Controller
                          control={phoneForm.control}
                          name="callingCodeDigits"
                          render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                              ref={callingInputRef}
                              keyboardType="number-pad"
                              autoComplete="tel-country-code"
                              textContentType="none"
                              maxLength={4}
                              accessibilityLabel="Country calling code"
                              placeholder="1"
                              placeholderTextColor={colors.textMuted}
                              value={value}
                              onFocus={() => setCallingFocused(true)}
                              onBlur={() => {
                                setCallingFocused(false);
                                onBlur();
                              }}
                              onChangeText={(text) => {
                                const prev = value;
                                const newDigits =
                                  sanitizeCallingCodeDigits(text);
                                const prevInfo =
                                  getCountryInfoFromCallingCodeDigits(prev);
                                const nextInfo =
                                  getCountryInfoFromCallingCodeDigits(
                                    newDigits,
                                  );
                                if (
                                  newDigits.length < prev.length &&
                                  prevInfo &&
                                  !nextInfo
                                ) {
                                  phoneForm.setValue("nationalNumber", "");
                                }
                                onChange(newDigits);
                                const complete =
                                  shouldAdvanceToNationalNumber(newDigits);
                                if (
                                  complete &&
                                  !wasCallingCompleteRef.current
                                ) {
                                  wasCallingCompleteRef.current = true;
                                  requestAnimationFrame(() => {
                                    nationalInputRef.current?.focus();
                                  });
                                } else if (!complete) {
                                  wasCallingCompleteRef.current = false;
                                }
                              }}
                              returnKeyType={
                                shouldAdvanceToNationalNumber(value)
                                  ? "next"
                                  : "done"
                              }
                              onSubmitEditing={() => {
                                if (shouldAdvanceToNationalNumber(value)) {
                                  nationalInputRef.current?.focus();
                                }
                              }}
                              style={[
                                styles.callingInput,
                                { color: colors.text },
                              ]}
                            />
                          )}
                        />
                      </View>
                      {countryInfo ? (
                        <Pressable
                          onPress={() => callingInputRef.current?.focus()}
                          accessibilityRole="button"
                          accessibilityLabel="Change country code"
                          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                          style={({ pressed }) => [
                            styles.countryMetaPressable,
                            {
                              backgroundColor: colors.inputFill,
                              borderColor: colors.inputBorder,
                              opacity: pressed ? 0.88 : 1,
                            },
                          ]}
                        >
                          <ThemedText
                            style={[styles.flagEmoji, { color: colors.text }]}
                            lightColor={colors.text}
                            darkColor={colors.text}
                          >
                            {countryInfo.flag}
                          </ThemedText>
                          <ThemedText
                            type="defaultSemiBold"
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            style={[
                              styles.countryMetaName,
                              { color: colors.textSecondary },
                            ]}
                            lightColor={colors.textSecondary}
                            darkColor={colors.textSecondary}
                          >
                            {countryInfo.name}
                          </ThemedText>
                        </Pressable>
                      ) : (
                        <View
                          style={[
                            styles.countryMetaPlaceholder,
                            { borderColor: colors.inputBorder },
                          ]}
                        />
                      )}
                    </View>
                    <ThemedText
                      style={[styles.fieldLabel, styles.fieldLabelSecond, { color: colors.textMuted }]}
                      lightColor={colors.textMuted}
                      darkColor={colors.textMuted}
                    >
                      Phone number
                    </ThemedText>
                    <Controller
                      control={phoneForm.control}
                      name="nationalNumber"
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                          ref={nationalInputRef}
                          keyboardType="phone-pad"
                          autoComplete="tel-national"
                          textContentType="telephoneNumber"
                          editable={Boolean(countryInfo)}
                          accessibilityLabel="Phone number"
                          placeholder={
                            countryInfo
                              ? "Enter your number"
                              : "Enter country code first"
                          }
                          placeholderTextColor={colors.textMuted}
                          value={value}
                          onFocus={() => setNationalFocused(true)}
                          onBlur={() => {
                            setNationalFocused(false);
                            onBlur();
                          }}
                          onChangeText={(text) => {
                            const iso = countryInfo?.countryCode;
                            if (!iso) return;
                            onChange(formatNationalAsYouType(iso, text));
                          }}
                          returnKeyType="done"
                          onSubmitEditing={onSubmitPhone}
                          style={[
                            styles.nationalInput,
                            {
                              color: colors.text,
                              borderBottomColor: phoneForm.formState.errors
                                .nationalNumber
                                ? colors.error
                                : nationalFocused
                                  ? colors.inputBorderFocus
                                  : colors.inputBorder,
                              backgroundColor: colors.inputFill,
                              opacity: countryInfo ? 1 : 0.55,
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
                      {phoneForm.formState.errors.callingCodeDigits
                        ?.message ??
                        phoneForm.formState.errors.nationalNumber?.message ??
                        " "}
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
  fieldLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  fieldLabelSecond: {
    marginTop: 14,
  },
  phoneSplitRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  callingShell: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 8,
    minHeight: 48,
    width: 108,
  },
  callingPlus: {
    fontSize: 17,
    marginRight: 2,
  },
  callingInput: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    paddingVertical: 0,
    paddingHorizontal: 0,
    minWidth: 36,
  },
  countryMetaPressable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  flagEmoji: {
    fontSize: 22,
    lineHeight: 26,
  },
  countryMetaName: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  countryMetaPlaceholder: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    minHeight: 48,
    opacity: 0.35,
  },
  nationalInput: {
    borderBottomWidth: 2,
    borderRadius: 12,
    fontSize: 22,
    lineHeight: 28,
    paddingVertical: 16,
    paddingHorizontal: 14,
    letterSpacing: 0.15,
    marginTop: 2,
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
