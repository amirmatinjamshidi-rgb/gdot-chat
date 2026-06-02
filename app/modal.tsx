import { Stack, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useThemeStore } from "@/stores/theme-store";

export default function ModalScreen() {
  const router = useRouter();
  const colors = useThemeStore((state) => state.colors);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: "Quick action" }} />
      <View style={styles.cardWrap}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.surfaceBorder,
            },
          ]}
        >
          <ThemedText
            type="title"
            style={[styles.title, { color: colors.text }]}
            lightColor={colors.text}
            darkColor={colors.text}
          >
            Not available yet
          </ThemedText>
          <ThemedText
            style={[styles.copy, { color: colors.textMuted }]}
            lightColor={colors.textMuted}
            darkColor={colors.textMuted}
          >
            This screen is a route stub from the home quick action. It can be
            replaced with compose, QR scan, or invites when those flows exist.
          </ThemedText>
          <ScalePressable
            style={[styles.button, { backgroundColor: colors.tint }]}
            onPress={() => router.back()}
          >
            <ThemedText
              style={styles.buttonText}
              lightColor={colors.onPrimary}
              darkColor={colors.onPrimary}
            >
              Close
            </ThemedText>
          </ScalePressable>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  cardWrap: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  copy: {
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  buttonText: {
    fontWeight: "700",
    fontSize: 16,
  },
});
