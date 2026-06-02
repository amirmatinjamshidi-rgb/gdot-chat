import { Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenTopAccent } from "@/components/screen-top-accent";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useThemeStore } from "@/stores/theme-store";

export default function CreateGroupScreen() {
  const [groupName, setGroupName] = useState("");
  const router = useRouter();
  const colors = useThemeStore((state) => state.colors);
  const canSubmit = groupName.trim().length > 0;
  const submitPulse = useSharedValue(0);

  useEffect(() => {
    submitPulse.value = withSpring(canSubmit ? 1 : 0, {
      damping: 14,
      stiffness: 220,
    });
  }, [canSubmit, submitPulse]);

  const submitAnim = useAnimatedStyle(() => ({
    transform: [{ scale: 0.98 + submitPulse.value * 0.04 }],
    opacity: 0.72 + submitPulse.value * 0.28,
  }));

  const createNewGroup = () => {
    if (!groupName.trim()) {
      return;
    }

    router.back();
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScreenTopAccent />
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: "Create group" }} />
        <View style={styles.form}>
          <ThemedText type="subtitle" style={{ color: colors.text }}>
            Group name
          </ThemedText>
          <ThemedText
            style={[styles.helperText, { color: colors.textMuted }]}
            lightColor={colors.textMuted}
            darkColor={colors.textMuted}
          >
            Enter a name for this group. Member selection will use your contacts
            list when that step is wired up.
          </ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputFill,
                color: colors.text,
                borderColor: colors.inputBorder,
              },
            ]}
            placeholder="Group name"
            placeholderTextColor={colors.textMuted}
            value={groupName}
            onChangeText={setGroupName}
          />
          <Animated.View style={submitAnim}>
            <ScalePressable
              style={[
                styles.button,
                canSubmit
                  ? { backgroundColor: colors.tint }
                  : {
                      backgroundColor: colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: colors.surfaceBorder,
                    },
              ]}
              disabled={!canSubmit}
              onPress={createNewGroup}
            >
              <ThemedText
                style={styles.buttonText}
                lightColor={canSubmit ? colors.onPrimary : colors.textMuted}
                darkColor={canSubmit ? colors.onPrimary : colors.textMuted}
              >
                Create group
              </ThemedText>
            </ScalePressable>
          </Animated.View>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "transparent",
  },
  form: {
    gap: 16,
  },
  helperText: {
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  button: {
    height: 50,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    fontWeight: "700",
    fontSize: 16,
  },
});
