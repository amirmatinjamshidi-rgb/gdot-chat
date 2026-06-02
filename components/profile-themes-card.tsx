import { ThemedText } from "@/components/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

export function ThemesCard() {
  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push("/profile-themes")}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: isDark ? "#10251E" : "#ECFDF5",
          borderColor: isDark ? "#1F4D3B" : "#BBF7D0",
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <View style={styles.iconWrap}>
        <MaterialIcons name="style" size={24} color="#BBF7D0" />
      </View>
      <View style={styles.copy}>
        <ThemedText type="defaultSemiBold" style={styles.title}>
          Themes
        </ThemedText>
      </View>
      <MaterialIcons
        name="chevron-right"
        size={44}
        color={isDark ? "#A7F3D0" : "#16A34A"}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 26,
    padding: 18,
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
    gap: 4,
  },
  title: {
    fontSize: 16,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
});
