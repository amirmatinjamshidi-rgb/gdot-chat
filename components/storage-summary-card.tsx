import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";

export function StorageSummaryCard() {
  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? "#122033" : "#EFF6FF",
          borderColor: isDark ? "#23344E" : "#DBEAFE",
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <MaterialIcons name="cloud-done" size={24} color="#2563EB" />
        </View>
        <View style={styles.copy}>
          <ThemedText type="defaultSemiBold" style={styles.title}>
            Media storage
          </ThemedText>
          <ThemedText
            style={styles.subtitle}
            lightColor="#64748B"
            darkColor="#AAB4C3"
          >
            Photos, videos, voice notes, APKs, and shared files
          </ThemedText>
        </View>
        <ThemedText
          type="defaultSemiBold"
          style={styles.percent}
          lightColor="#2563EB"
          darkColor="#93C5FD"
        >
          25%
        </ThemedText>
      </View>

      <View
        style={[
          styles.track,
          { backgroundColor: isDark ? "#334155" : "#BFDBFE" },
        ]}
      >
        <View style={styles.progress} />
      </View>

      <View style={styles.footer}>
        <ThemedText
          style={styles.footerText}
          lightColor="#64748B"
          darkColor="#AAB4C3"
        >
          12.4 GB used
        </ThemedText>
        <ThemedText
          style={styles.footerText}
          lightColor="#64748B"
          darkColor="#AAB4C3"
        >
          29.6 GB free
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 26,
    padding: 18,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 16,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  percent: {
    fontSize: 18,
  },
  track: {
    height: 8,
    overflow: "hidden",
    borderRadius: 999,
  },
  progress: {
    width: "42%",
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#2563EB",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 12,
  },
});
