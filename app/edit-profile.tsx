import { Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenTopAccent } from "@/components/screen-top-accent";
import { ThemedText } from "@/components/themed-text";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useProfilePrefs } from "@/hooks/use-profile-prefs";
import { useAppServices } from "@/lib/services/app-services-context";
import { useColors } from "@/stores/theme-store";

export default function EditProfileScreen() {
  const router = useRouter();
  const colors = useColors();
  const { identityStore } = useAppServices();
  const prefs = useProfilePrefs();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(prefs.displayName);
  const [bio, setBio] = useState(prefs.bio);
  const [phoneE164, setPhoneE164] = useState(prefs.phoneE164);
  const [birthday, setBirthday] = useState(prefs.birthday);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setDisplayName(prefs.displayName);
    setBio(prefs.bio);
    setPhoneE164(prefs.phoneE164);
    setBirthday(prefs.birthday);
  }, [prefs.displayName, prefs.bio, prefs.phoneE164, prefs.birthday]);

  useEffect(() => {
    void identityStore.getLocalIdentity().then((id) => {
      setUsername(id?.username ?? "");
      setLoading(false);
    });
  }, [identityStore]);

  const onSave = () => {
    void prefs.updatePrefs({
      displayName: displayName.trim(),
      bio: bio.trim(),
      phoneE164: phoneE164.trim(),
      birthday: birthday.trim(),
    });
    router.back();
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["bottom"]}
    >
      <ScreenTopAccent />
      <Stack.Screen
        options={{
          title: "Edit profile",
          headerBackTitle: "Profile",
          headerStyle: { backgroundColor: colors.surfaceElevated },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedText
          style={[styles.hint, { color: colors.textMuted }]}
          lightColor={colors.textMuted}
          darkColor={colors.textMuted}
        >
          Username (@{username}) is set at registration and cannot be changed
          here yet.
        </ThemedText>

        <Field
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="How your name appears on profile"
        />
        <Field
          label="Bio"
          value={bio}
          onChangeText={setBio}
          placeholder="A short bio"
          multiline
        />
        <Field
          label="Phone"
          value={phoneE164}
          onChangeText={setPhoneE164}
          placeholder="+1 555 000 0000"
          keyboardType="phone-pad"
        />
        <Field
          label="Birthday"
          value={birthday}
          onChangeText={setBirthday}
          placeholder="May 12, 1998"
        />

        <ScalePressable
          style={[styles.saveBtn, { backgroundColor: colors.tint }]}
          onPress={onSave}
        >
          <ThemedText
            style={{ color: colors.onPrimary, fontWeight: "700" }}
            lightColor={colors.onPrimary}
            darkColor={colors.onPrimary}
          >
            Save
          </ThemedText>
        </ScalePressable>

        <ScalePressable
          onPress={() =>
            Alert.alert(
              "Reset local profile",
              "Clear display name, bio, phone, and birthday on this device?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Reset",
                  style: "destructive",
                  onPress: () => {
                    void prefs.resetPrefs();
                    setDisplayName("");
                    setBio("");
                    setPhoneE164("");
                    setBirthday("");
                  },
                },
              ],
            )
          }
        >
          <ThemedText
            style={[styles.resetLink, { color: colors.textMuted }]}
            lightColor={colors.textMuted}
            darkColor={colors.textMuted}
          >
            Reset optional fields
          </ThemedText>
        </ScalePressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: "default" | "phone-pad";
}) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <ThemedText
        style={[styles.fieldLabel, { color: colors.textMuted }]}
        lightColor={colors.textMuted}
        darkColor={colors.textMuted}
      >
        {label}
      </ThemedText>
      <TextInput
        style={[
          styles.input,
          multiline && styles.inputMulti,
          {
            color: colors.text,
            backgroundColor: colors.inputFill,
            borderColor: colors.surfaceBorder,
          },
        ]}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  hint: { fontSize: 14, lineHeight: 20 },
  field: { gap: 8 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputMulti: { minHeight: 96, textAlignVertical: "top" },
  saveBtn: {
    marginTop: 8,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  resetLink: {
    textAlign: "center",
    fontSize: 14,
    paddingVertical: 8,
  },
});
