import { Stack, useRouter } from "expo-router";
import React from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useThemeStore, useColors } from "@/stores/theme-store";

const AVATAR = 46;

const MOCK_CONTACTS = [
  { id: "1", name: "بابات", status: "Online" as const },
  { id: "2", name: "Bob", status: "Away" as const },
  { id: "3", name: "Charlie", status: "Offline" as const },
  { id: "4", name: "David", status: "Online" as const },
];

export default function ContactsScreen() {
  const colors = useColors();
  const mode = useThemeStore((state) => state.mode);
  const isDark = mode === "dark";
  const router = useRouter();

  const statusColor = (status: (typeof MOCK_CONTACTS)[number]["status"]) => {
    if (status === "Online") return colors.success;
    if (status === "Away") return colors.tintMuted;
    return colors.textMuted;
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: "Contacts" }} />
      <FlatList
        style={styles.list}
        data={MOCK_CONTACTS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText
              type="defaultSemiBold"
              style={{ color: colors.text }}
              lightColor={colors.text}
              darkColor={colors.text}
            >
              No contacts
            </ThemedText>
            <ThemedText
              style={[styles.emptyHint, { color: colors.textMuted }]}
              lightColor={colors.textMuted}
              darkColor={colors.textMuted}
            >
              Sync or import contacts when that feature is enabled.
            </ThemedText>
          </View>
        }
        renderItem={({ item }) => (
          <ScalePressable
            style={[
              styles.row,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.surfaceBorder,
              },
            ]}
            onPress={() =>
              router.push({
                pathname: "/ChatRoom",
                params: { id: item.id, name: item.name },
              })
            }
          >
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: isDark
                    ? colors.backgroundSecondary
                    : colors.backgroundSecondary,
                  borderWidth: 1,
                  borderColor: colors.surfaceBorder,
                },
              ]}
            >
              <ThemedText
                style={[styles.avatarLetter, { color: colors.primary }]}
                lightColor={colors.primary}
                darkColor={colors.primary}
              >
                {item.name[0]}
              </ThemedText>
            </View>
            <View style={styles.rowBody}>
              <ThemedText
                type="defaultSemiBold"
                numberOfLines={1}
                style={[styles.name, { color: colors.text }]}
                lightColor={colors.text}
                darkColor={colors.text}
              >
                {item.name}
              </ThemedText>
              <ThemedText
                style={[styles.statusText, { color: statusColor(item.status) }]}
              >
                {item.status}
              </ThemedText>
            </View>
          </ScalePressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.separatorGhost} />}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 24,
    flexGrow: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 12,
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    marginVertical: 4,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: "center",
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    fontSize: 17,
    fontWeight: "800",
  },
  name: {
    fontSize: 16,
    lineHeight: 22,
  },
  statusText: {
    fontSize: 13,
    lineHeight: 18,
  },
  separatorGhost: {
    height: 0,
  },
  empty: {
    paddingTop: 48,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyHint: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
