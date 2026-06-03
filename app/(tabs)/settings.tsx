import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenTopAccent } from "@/components/screen-top-accent";
import { SecuritySummaryCard } from "@/components/security-summary-card";
import { SettingsSection } from "@/components/settings-section";
import { StorageSummaryCard } from "@/components/storage-summary-card";
import { ThemedText } from "@/components/themed-text";
import { ThemesCard } from "@/components/profile-themes-card";
import { ScalePressable } from "@/components/ui/scale-pressable";
import {
  settingsSections,
  type SettingsSection as SettingsSectionType,
} from "@/constants/profile-data";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useColors } from "@/stores/theme-store";

/**
 * Account preferences, theme, storage, and toggles (moved from Profile).
 * Visual polish can follow in a later pass.
 */
export default function SettingsScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";
  const signOut = useAuthStore((state) => state.signOut);
  const colors = useColors();
  const toggles = useSettingsStore((state) => state.toggles);
  const setToggle = useSettingsStore((state) => state.setToggle);

  const sections = useMemo<SettingsSectionType[]>(
    () =>
      settingsSections.map((section) => ({
        ...section,
        items: section.items.map((item) =>
          item.hasToggle
            ? {
                ...item,
                enabled:
                  typeof toggles[item.id] === "boolean"
                    ? toggles[item.id]
                    : Boolean(item.enabled),
              }
            : item,
        ),
      })),
    [toggles],
  );

  const handleToggle = (id: string, enabled: boolean) => {
    setToggle(id, enabled);
  };

  const handleLogoutPress = () => {
    Alert.alert("Log out", "You are about to log out. Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => {
          void signOut();
        },
      },
    ]);
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScreenTopAccent />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <ThemedText type="title" style={styles.screenTitle}>
              Settings
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
            onPress={() =>
              Alert.alert(
                "QR scanner",
                "QR contact adding will be connected soon.",
              )
            }
            style={[
              styles.iconButton,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.surfaceBorder,
              },
            ]}
          >
            <MaterialIcons
              name="qr-code-scanner"
              size={28}
              color={colors.text}
            />
          </ScalePressable>
        </View>

        <View>
          <ThemedText
            type="subtitle"
            style={[styles.sectionLabel, { color: colors.text }]}
            lightColor={colors.text}
            darkColor={colors.text}
          >
            Theme
          </ThemedText>
        </View>

        <ThemesCard />
        <SecuritySummaryCard />
        <StorageSummaryCard />

        {sections.map((section) => (
          <View key={section.id}>
            <SettingsSection section={section} onToggle={handleToggle} />
          </View>
        ))}

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
          <ThemedText
            style={styles.logoutText}
            lightColor="#DC2626"
            darkColor="#F87171"
          >
            Log out
          </ThemedText>
        </ScalePressable>
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
    paddingBottom: 100,
    gap: 18,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  screenTitle: {
    fontSize: 34,
    lineHeight: 42,
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
  sectionLabel: {
    fontSize: 18,
    marginBottom: 4,
    lineHeight: 24,
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
});
