import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { CountryCode } from "libphonenumber-js";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import {
  filterPhonePickerCountries,
  getAllPhonePickerCountries,
  type PhonePickerCountry,
} from "@/lib/auth/phone-countries";
import { useColors } from "@/stores/theme-store";

const ROW_H = 54;

type Props = {
  visible: boolean;
  selectedIso: string;
  onClose: () => void;
  onSelect: (iso: CountryCode) => void;
};

export function PhoneCountryPickerModal({
  visible,
  selectedIso,
  onClose,
  onSelect,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const allRows = useMemo(() => getAllPhonePickerCountries(), []);
  const filtered = useMemo(
    () => filterPhonePickerCountries(allRows, query),
    [allRows, query],
  );

  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  const renderItem = ({ item }: { item: PhonePickerCountry }) => {
    const selected = item.iso === selectedIso;
    return (
      <Pressable
        onPress={() => {
          onSelect(item.iso);
          onClose();
        }}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: selected
              ? colors.inputFill
              : pressed
                ? colors.backgroundSecondary
                : "transparent",
            borderBottomColor: colors.surfaceBorder,
          },
        ]}
      >
        <ThemedText
          style={[styles.flag, { color: colors.text }]}
          lightColor={colors.text}
          darkColor={colors.text}
        >
          {item.flag}
        </ThemedText>
        <View style={styles.rowMid}>
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
            style={[styles.iso, { color: colors.textMuted }]}
            lightColor={colors.textMuted}
            darkColor={colors.textMuted}
          >
            {item.iso}
          </ThemedText>
        </View>
        <ThemedText
          type="defaultSemiBold"
          style={[styles.code, { color: colors.textSecondary }]}
          lightColor={colors.textSecondary}
          darkColor={colors.textSecondary}
        >
          +{item.callingCode}
        </ThemedText>
        {selected ? (
          <MaterialIcons
            name="check"
            size={22}
            color={colors.primary}
            style={styles.check}
          />
        ) : null}
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            styles.header,
            {
              paddingTop: Math.max(insets.top, 12),
              borderBottomColor: colors.surfaceBorder,
            },
          ]}
        >
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
          >
            <ThemedText
              type="defaultSemiBold"
              style={{ color: colors.link }}
              lightColor={colors.link}
              darkColor={colors.link}
            >
              Cancel
            </ThemedText>
          </Pressable>
          <ThemedText
            type="defaultSemiBold"
            style={[styles.headerTitle, { color: colors.text }]}
            lightColor={colors.text}
            darkColor={colors.text}
          >
            Country or region
          </ThemedText>
          <View style={styles.headerBtn} />
        </View>

        <View
          style={[
            styles.searchShell,
            {
              borderColor: colors.inputBorder,
              backgroundColor: colors.inputFill,
            },
          ]}
        >
          <MaterialIcons
            name="search"
            size={22}
            color={colors.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or code"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="default"
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.text }]}
            accessibilityLabel="Search countries"
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.iso}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={18}
          maxToRenderPerBatch={24}
          windowSize={8}
          removeClippedSubviews={Platform.OS === "android"}
          ListEmptyComponent={
            <ThemedText
              style={[styles.empty, { color: colors.textMuted }]}
              lightColor={colors.textMuted}
              darkColor={colors.textMuted}
            >
              No matches
            </ThemedText>
          }
          contentContainerStyle={{
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    minWidth: 72,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 17,
  },
  searchShell: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    minHeight: 44,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    minHeight: ROW_H,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flag: {
    fontSize: 26,
    marginRight: 12,
  },
  rowMid: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
  },
  iso: {
    fontSize: 12,
    marginTop: 2,
  },
  code: {
    fontSize: 16,
    marginLeft: 8,
  },
  check: {
    marginLeft: 6,
  },
  empty: {
    textAlign: "center",
    marginTop: 36,
    fontSize: 15,
  },
});
