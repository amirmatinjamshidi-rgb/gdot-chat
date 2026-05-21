import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
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
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function ProfileScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";
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

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: isDark ? "#111827" : "#F6F8FC" },
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
                lightColor="#64748B"
                darkColor="#AAB4C3"
              >
                Account, safety, storage, and preferences
              </ThemedText>
            </View>
            <ScalePressable
              onPress={() => Alert.alert('QR scanner', 'QR contact adding will be connected soon.')}
              style={[
                styles.iconButton,
                {
                  backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
                  borderColor: isDark ? "#2F3A4A" : "#E8EEF8",
                  borderWidth: 1,
                },
              ]}
            >
              <MaterialIcons
                name="qr-code-scanner"
                size={23}
                color={isDark ? "#E5E7EB" : "#111827"}
              />
            </ScalePressable>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(70).springify()}>
          <View
            style={[
              styles.profileCard,
              {
                backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
                borderColor: isDark ? "#2F3A4A" : "#E8EEF8",
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
              lightColor="#3B82F6"
              darkColor="#93C5FD"
            >
              {profile.handle}
            </ThemedText>
            <ThemedText
              style={styles.status}
              lightColor="#64748B"
              darkColor="#AAB4C3"
            >
              {profile.status}
            </ThemedText>
            <View style={styles.metaRow}>
              <MaterialIcons
                name="phone-iphone"
                size={16}
                color={isDark ? "#AAB4C3" : "#64748B"}
              />
              <ThemedText
                style={styles.metaText}
                lightColor="#64748B"
                darkColor="#AAB4C3"
              >
                {profile.phone}
              </ThemedText>
              <View
                style={[
                  styles.metaDivider,
                  { backgroundColor: isDark ? "#475569" : "#CBD5E1" },
                ]}
              />
              <ThemedText
                style={styles.metaText}
                lightColor="#64748B"
                darkColor="#AAB4C3"
              >
                {profile.joinedAt}
              </ThemedText>
            </View>
          </View>
        </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(130).springify()}>
          <View style={styles.actionsGrid}>
            {profileActions.map((action) => (
              <View key={action.id} style={styles.actionCell}>
                <ProfileActionCard action={action} />
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).springify()}>
          <SecuritySummaryCard />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(220).springify()}>
          <StorageSummaryCard />
        </Animated.View>

        {sections.map((section, index) => (
          <Animated.View
            key={section.id}
            entering={FadeInDown.delay(260 + index * 55).springify()}
          >
            <SettingsSection section={section} onToggle={handleToggle} />
          </Animated.View>
        ))}
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
});
