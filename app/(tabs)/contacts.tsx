import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { ChatSearchBar } from "@/components/chat-search-bar";
import { ScreenTopAccent } from "@/components/screen-top-accent";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useContactsStore, type Contact } from "@/stores/contacts-store";
import { useColors, useThemeStore } from "@/stores/theme-store";

const AVATAR = 46;

export default function ContactsTabScreen() {
  const colors = useColors();
  const mode = useThemeStore((state) => state.mode);
  const isDark = mode === "dark";
  const router = useRouter();

  const searchQuery = useContactsStore((state) => state.searchQuery);
  const setSearchQuery = useContactsStore((state) => state.setSearchQuery);
  const getFilteredContacts = useContactsStore(
    (state) => state.getFilteredContacts,
  );
  const initializeMockData = useContactsStore(
    (state) => state.initializeMockData,
  );
  const filteredContacts = getFilteredContacts();

  useEffect(() => {
    initializeMockData();
  }, [initializeMockData]);

  const statusColor = (status: Contact["status"]) => {
    if (status === "Online") return colors.success;
    if (status === "Away") return colors.tintMuted;
    return colors.textMuted;
  };

  return (
    <ThemedView style={styles.container}>
      <ScreenTopAccent />
      <View style={styles.searchBarContainer}>
        {" "}
        <ChatSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          visible
          isDark={isDark}
          accentHex={colors.tint}
          glowHex={colors.accentGlow}
        />
      </View>
      <FlatList
        style={styles.list}
        data={filteredContacts}
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
                  backgroundColor: colors.backgroundSecondary,
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
  searchBarContainer: {
    paddingHorizontal: 12,
    marginBottom: 12,
    marginTop: 52,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 120,
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
