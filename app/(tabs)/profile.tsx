import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ProfileAvatar } from "@/components/profile-avatar";
import { ProfileInfoPanel } from "@/components/profile-info-panel";
import {
<<<<<<< HEAD
  profile,
  profileActions,
  settingsSections,
  type SettingsSection as SettingsSectionType,
} from "@/constants/profile-data";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/lib/providers/auth-provider";
import { useSettingsStore } from "@/stores/settings-store";
import { useColors } from "@/stores/theme-store";

export default function ProfileScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";
  const { signOut } = useAuth();
=======
  ProfilePrimaryActions,
  profilePrimaryActionPlaceholders,
} from "@/components/profile-primary-actions";
import { ThemedText } from "@/components/themed-text";
import { profile } from "@/constants/profile-data";
import { useAuthStore } from "@/stores/auth-store";
import { useColors } from "@/stores/theme-store";

export default function ProfileScreen() {
>>>>>>> 120f59a07c86f57a4f26460c84949f86ec5a9ccf
  const colors = useColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const placeholders = useMemo(() => profilePrimaryActionPlaceholders(), []);

  const phoneE164 = useMemo(() => {
    if (user?.method === "phone" && user.identifier) {
      return user.identifier;
    }
    return profile.phoneE164;
  }, [user]);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <ProfileAvatar
            size={120}
            initials={profile.avatarInitials}
            source={profile.avatarImage}
          />
          <ThemedText
            type="title"
            style={[styles.username, { color: colors.text }]}
            lightColor={colors.text}
            darkColor={colors.text}
          >
            {profile.name}
          </ThemedText>
        </View>

        <ProfilePrimaryActions
          onSetPhoto={placeholders.onSetPhoto}
          onEditInfo={placeholders.onEditInfo}
          onSettings={() => {
            router.push("/(tabs)/settings");
          }}
        />

        <ProfileInfoPanel
          phoneE164={phoneE164}
          bio={profile.bio}
          usernameAt={profile.handle}
          birthday={profile.birthday}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
    gap: 22,
  },
  hero: {
    alignItems: "center",
    gap: 14,
  },
  username: {
    fontSize: 24,
    lineHeight: 30,
    textAlign: "center",
    fontWeight: "700",
  },
});
