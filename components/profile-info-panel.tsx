import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useColors } from "@/stores/theme-store";

export type ProfileInfoPanelProps = {
  phoneE164: string;
  bio: string;
  usernameAt: string;
  birthday: string;
};

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <ThemedText
        style={[styles.label, { color: colors.textMuted }]}
        lightColor={colors.textMuted}
        darkColor={colors.textMuted}
      >
        {label}
      </ThemedText>
      <ThemedText
        type="defaultSemiBold"
        style={[styles.value, { color: colors.text }]}
        lightColor={colors.text}
        darkColor={colors.text}
      >
        {value}
      </ThemedText>
    </View>
  );
}

/**
 * Left-aligned profile facts (phone E.164, bio, @username, birthday) in a muted panel.
 */
export function ProfileInfoPanel({
  phoneE164,
  bio,
  usernameAt,
  birthday,
}: ProfileInfoPanelProps) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: colors.backgroundSecondary,
          borderColor: colors.surfaceBorder,
        },
      ]}
    >
      <Row label="Phone" value={phoneE164} />
      <View style={[styles.divider, { backgroundColor: colors.surfaceBorder }]} />
      <Row label="Bio" value={bio} />
      <View style={[styles.divider, { backgroundColor: colors.surfaceBorder }]} />
      <Row label="Username" value={usernameAt.startsWith("@") ? usernameAt : `@${usernameAt}`} />
      <View style={[styles.divider, { backgroundColor: colors.surfaceBorder }]} />
      <Row label="Birthday" value={birthday} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 4,
    alignSelf: "stretch",
  },
  row: {
    alignItems: "flex-start",
    paddingVertical: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  value: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: "left",
    alignSelf: "stretch",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },
});
