import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ProfileAvatar } from "@/components/profile-avatar";
import { ProfileInfoPanel } from "@/components/profile-info-panel";
import { ProfilePrimaryActions } from "@/components/profile-primary-actions";
import { ThemedText } from "@/components/themed-text";
import { useLocalProfile } from "@/hooks/use-local-profile";
import { shortId } from "@/lib/profile/display";
import { useColors } from "@/stores/theme-store";

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const profile = useLocalProfile();

  const infoRows = useMemo(() => {
    const rows = [
      { label: "Username", value: profile.usernameAt },
      { label: "Bio", value: profile.bio },
      { label: "Phone", value: profile.phoneE164 },
      { label: "Birthday", value: profile.birthday },
      { label: "User ID", value: shortId(profile.userId) },
      { label: "Device ID", value: shortId(profile.deviceId) },
    ];
    if (profile.registrationId != null) {
      rows.push({
        label: "Registration ID",
        value: String(profile.registrationId),
      });
    }
    rows.push(
      { label: "Member since", value: profile.memberSince },
      {
        label: "Chats",
        value: String(profile.conversationCount),
      },
    );
    return rows;
  }, [profile]);

  if (profile.loading) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <View style={styles.loading}>
          <ActivityIndicator color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile.username && !profile.userId) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <View style={styles.loading}>
          <ThemedText
            style={{ color: colors.textMuted, textAlign: "center" }}
            lightColor={colors.textMuted}
            darkColor={colors.textMuted}
          >
            Unlock the app and sign in to view your profile.
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <ProfileAvatar size={120} initials={profile.initials} />
          <ThemedText
            type="title"
            style={[styles.displayName, { color: colors.text }]}
            lightColor={colors.text}
            darkColor={colors.text}
          >
            {profile.displayName}
          </ThemedText>
          <ThemedText
            style={[styles.handle, { color: colors.textMuted }]}
            lightColor={colors.textMuted}
            darkColor={colors.textMuted}
          >
            {profile.usernameAt}
          </ThemedText>
        </View>

        <ProfilePrimaryActions
          onSetPhoto={() =>
            Alert.alert(
              "Set photo",
              "Profile photos will be stored locally in a future update.",
            )
          }
          onEditInfo={() => router.push("/edit-profile")}
          onSettings={() => router.push("/(tabs)/settings")}
        />

        <ProfileInfoPanel rows={infoRows} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
    gap: 22,
  },
  hero: {
    alignItems: "center",
    gap: 6,
  },
  displayName: {
    fontSize: 24,
    lineHeight: 30,
    textAlign: "center",
    fontWeight: "700",
    marginTop: 8,
  },
  handle: {
    fontSize: 15,
    lineHeight: 20,
  },
});
