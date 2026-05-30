import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ProfileActionCard } from "@/components/profile-action-card";
import { ProfileAvatar } from "@/components/profile-avatar";
import { SecuritySummaryCard } from "@/components/security-summary-card";
import { SettingsSection } from "@/components/settings-section";
import { StorageSummaryCard } from "@/components/storage-summary-card";
import { ThemedText } from "@/components/themed-text";
import { ScalePressable } from "@/components/ui/scale-pressable";
import {
  profile,
  profileActions,
  settingsSections,
  type SettingsSection as SettingsSectionType
} from "@/constants/profile-data";
import { APP_THEMES, type ThemeId } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/providers/auth-provider";
import { useThemePalette } from "@/providers/theme-palette-provider";

export default function ProfileScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";
  const { signOut } = useAuth();
  const { themeId, setThemeId, colors } = useThemePalette();
  const [toggleState, setToggleState] = useState(
    Object.fromEntries(
      settingsSections.flatMap((section) =>
        section.items
          .filter((item) => item.hasToggle)
          .map((item) => [item.id, Boolean(item.enabled)]),
      ),
    ),
  );

  const sections = useMemo<SettingsSectionType[]>(
    () =>
      settingsSections.map((section) => ({
        ...section,
        items: section.items.map((item) =>
          item.hasToggle ? { ...item, enabled: toggleState[item.id] } : item,
        ),
      })),
    [toggleState],
  );

  const handleToggle = (id: string, enabled: boolean) => {
    setToggleState((current) => ({ ...current, [id]: enabled }));
  };

  const handleLogoutPress = () => {
    Alert.alert(
      "Log out",
      "You are about to log out. Are you sure?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Logout",
          style: "destructive",
          onPress: () => {
            void signOut();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: colors.background },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.springify()}>
          <View style={styles.headerRow}>
            <View>
              <ThemedText type="title" style={styles.screenTitle}>
                Profile
              </ThemedText>
              <ThemedText
                style={styles.screenSubtitle}
                lightColor={colors.textMuted}
                darkColor={colors.textMuted}
              >
                Account, safety, storage, and preferences
              </ThemedText>
            </View>
            <ScalePressable
              onPress={() => Alert.alert('QR scanner', 'QR contact adding will be connected soon.')}
              style={[
                styles.iconButton,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.surfaceBorder,
                  borderWidth: 1,
                },
              ]}
            >
              <MaterialIcons
                name="qr-code-scanner"
                size={23}
                color={colors.text}
              />
            </ScalePressable>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(70).springify()}>
          <ThemedText
            type="subtitle"
            style={[styles.sectionLabel, { color: colors.text }]}
            lightColor={colors.text}
            darkColor={colors.text}
          >
            Signature look
          </ThemedText>
          <ThemedText
            style={[styles.sectionHint, { color: colors.textMuted }]}
            lightColor={colors.textMuted}
            darkColor={colors.textMuted}
          >
            Curated palettes — saved on this device.
          </ThemedText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.themeScroll}
          >
            {APP_THEMES.map((t) => {
              const active = themeId === t.id;
              const swatch = isDark ? t.dark : t.light;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setThemeId(t.id as ThemeId)}
                  style={({ pressed }) => [
                    styles.themeCard,
                    {
                      borderColor: active ? swatch.tint : colors.surfaceBorder,
                      backgroundColor: colors.surfaceElevated,
                      opacity: pressed ? 0.88 : 1,
                    },
                    active && { shadowColor: swatch.tint, shadowOpacity: 0.35 },
                  ]}
                >
                  <View style={styles.themeSwatches}>
                    <View
                      style={[
                        styles.swatchDot,
                        { backgroundColor: swatch.primary },
                      ]}
                    />
                    <View
                      style={[
                        styles.swatchDot,
                        { backgroundColor: swatch.tint },
                      ]}
                    />
                    <View
                      style={[
                        styles.swatchDot,
                        { backgroundColor: swatch.gradientMid },
                      ]}
                    />
                  </View>
                  <ThemedText
                    type="defaultSemiBold"
                    style={[styles.themeTitle, { color: colors.text }]}
                    lightColor={colors.text}
                    darkColor={colors.text}
                  >
                    {t.label}
                  </ThemedText>
                  <ThemedText
                    numberOfLines={2}
                    style={[styles.themeTag, { color: colors.textMuted }]}
                    lightColor={colors.textMuted}
                    darkColor={colors.textMuted}
                  >
                    {t.tagline}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(90).springify()}>
          <View
            style={[
              styles.profileCard,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.surfaceBorder,
              },
            ]}
          >
          <ProfileAvatar initials={profile.avatarInitials} />
          <View style={styles.profileCopy}>
            <ThemedText type="subtitle" style={styles.name}>
              {profile.name}
            </ThemedText>
            <ThemedText
              style={styles.handle}
              lightColor={colors.tint}
              darkColor={colors.tintMuted}
            >
              {profile.handle}
            </ThemedText>
            <ThemedText
              style={styles.status}
              lightColor={colors.textMuted}
              darkColor={colors.textMuted}
            >
              {profile.status}
            </ThemedText>
            <View style={styles.metaRow}>
              <MaterialIcons
                name="phone-iphone"
                size={16}
                color={colors.textMuted}
              />
              <ThemedText
                style={styles.metaText}
                lightColor={colors.textMuted}
                darkColor={colors.textMuted}
              >
                {profile.phone}
              </ThemedText>
              <View
                style={[
                  styles.metaDivider,
                  { backgroundColor: colors.surfaceBorder },
                ]}
              />
              <ThemedText
                style={styles.metaText}
                lightColor={colors.textMuted}
                darkColor={colors.textMuted}
              >
                {profile.joinedAt}
              </ThemedText>
            </View>
          </View>
        </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(140).springify()}>
          <View style={styles.actionsGrid}>
            {profileActions.map((action) => (
              <View key={action.id} style={styles.actionCell}>
                <ProfileActionCard action={action} />
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <SecuritySummaryCard />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(240).springify()}>
          <StorageSummaryCard />
        </Animated.View>

        {sections.map((section, index) => (
          <Animated.View
            key={section.id}
            entering={FadeInDown.delay(300 + index * 55).springify()}
          >
            <SettingsSection section={section} onToggle={handleToggle} />
          </Animated.View>
        ))}

        <Animated.View entering={FadeInDown.delay(560).springify()}>
          <ScalePressable
            accessibilityRole="button"
            accessibilityLabel="Log out"
            onPress={handleLogoutPress}
            style={[
              styles.logoutRow,
              {
                backgroundColor: isDark
                  ? "rgba(239,68,68,0.12)"
                  : "rgba(239,68,68,0.08)",
                borderColor: isDark
                  ? "rgba(248,113,113,0.35)"
                  : "rgba(239,68,68,0.22)",
              },
            ]}
          >
            <MaterialIcons name="logout" size={20} color="#EF4444" />
            <ThemedText style={styles.logoutText} lightColor="#DC2626" darkColor="#F87171">
              Log out
            </ThemedText>
          </ScalePressable>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 32,
    gap: 18,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  screenTitle: {
    fontSize: 34,
    lineHeight: 38,
  },
  screenSubtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 18,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 32,
    padding: 18,
    gap: 18,
  },
  profileCopy: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 23,
  },
  handle: {
    fontSize: 15,
    fontWeight: "700",
  },
  status: {
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 8,
    gap: 6,
  },
  metaText: {
    fontSize: 12,
  },
  metaDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  actionsGrid: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
  },
  actionCell: {
    flex: 1,
    minWidth: 0,
  },
  logoutRow: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: "700",
  },
  sectionLabel: {
    fontSize: 18,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  themeScroll: {
    gap: 12,
    paddingRight: 18,
    paddingBottom: 4,
  },
  themeCard: {
    width: 156,
    borderRadius: 20,
    borderWidth: 2,
    padding: 14,
    marginRight: 4,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 4,
  },
  themeSwatches: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  swatchDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  themeTitle: {
    fontSize: 15,
    marginBottom: 4,
  },
  themeTag: {
    fontSize: 12,
    lineHeight: 16,
  },
});
