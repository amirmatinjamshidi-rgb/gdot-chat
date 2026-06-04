import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useColors } from "@/stores/theme-store";

export type ProfileInfoRow = {
  label: string;
  value: string;
};

export type ProfileInfoPanelProps = {
  rows: ProfileInfoRow[];
};

function Row({ label, value }: ProfileInfoRow) {
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

export function ProfileInfoPanel({ rows }: ProfileInfoPanelProps) {
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
      {rows.map((row, index) => (
        <View key={row.label}>
          {index > 0 ? (
            <View
              style={[styles.divider, { backgroundColor: colors.surfaceBorder }]}
            />
          ) : null}
          <Row label={row.label} value={row.value} />
        </View>
      ))}
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
