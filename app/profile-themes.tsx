import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { APP_THEMES, type ThemeId } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useThemeStore } from "@/stores/theme-store";
import { Stack } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

export default function ProfileThemesScreen() {
  const themeId = useThemeStore((state) => state.themeId);
  const setThemeId = useThemeStore((state) => state.setThemeId);
  const colors = useThemeStore((state) => state.colors);
  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: "Themes" }} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText
          type="default"
          style={[styles.intro, { color: colors.textMuted }]}
          lightColor={colors.textMuted}
          darkColor={colors.textMuted}
        >
          Choose a color palette for the app. You can still follow system light
          or dark mode from device settings.
        </ThemedText>
        <View style={styles.themeGrid}>
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
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  themeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingBottom: 4,
  },
  themeCard: {
    width: "47.5%",
    minWidth: 140,
    maxWidth: "100%",
    flexGrow: 1,
    borderRadius: 20,
    borderWidth: 2,
    padding: 14,
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
    lineHeight: 20,
  },
  themeTag: {
    fontSize: 12,
    lineHeight: 16,
  },
});
