import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ComponentProps } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useColors } from "@/stores/theme-store";

type ProfilePrimaryActionsProps = {
  onSetPhoto: () => void;
  onEditInfo: () => void;
  onSettings: () => void;
};

type ActionDef = {
  id: string;
  label: string;
  icon: ComponentProps<typeof MaterialIcons>["name"];
  onPress: () => void;
};

/**
 * Three equal primary actions (set photo, edit info, settings) — one row, shared chrome.
 */
export function ProfilePrimaryActions({
  onSetPhoto,
  onEditInfo,
  onSettings,
}: ProfilePrimaryActionsProps) {
  const colors = useColors();

  const actions: ActionDef[] = [
    { id: "photo", label: "Set photo", icon: "photo-camera", onPress: onSetPhoto },
    { id: "edit", label: "Edit info", icon: "edit", onPress: onEditInfo },
    { id: "settings", label: "Settings", icon: "settings", onPress: onSettings },
  ];

  return (
    <View style={styles.row}>
      {actions.map((a) => (
        <Pressable
          key={a.id}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          onPress={a.onPress}
          style={({ pressed }) => [
            styles.btn,
            {
              borderColor: colors.surfaceBorder,
              backgroundColor: colors.inputFill,
              opacity: pressed ? 0.88 : 1,
            },
          ]}
        >
          <MaterialIcons name={a.icon} size={22} color={colors.primary} />
          <ThemedText
            type="defaultSemiBold"
            numberOfLines={2}
            style={[styles.label, { color: colors.text }]}
            lightColor={colors.text}
            darkColor={colors.text}
          >
            {a.label}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

/** Default handlers until flows are wired (photo picker, edit profile screen). */
export function profilePrimaryActionPlaceholders() {
  return {
    onSetPhoto: () =>
      void Alert.alert("Set photo", "Photo picker will be connected here."),
    onEditInfo: () =>
      void Alert.alert("Edit info", "Profile editing will open here."),
  };
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
    alignSelf: "stretch",
  },
  btn: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 88,
  },
  label: {
    fontSize: 12,
    lineHeight: 15,
    textAlign: "center",
  },
});
