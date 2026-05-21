import React, { useEffect, useState } from "react";
import { StyleSheet, TextInput } from "react-native";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function CreateGroupScreen() {
  const [groupName, setGroupName] = useState('');
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const canSubmit = groupName.trim().length > 0;
  const submitPulse = useSharedValue(0);

  useEffect(() => {
    submitPulse.value = withSpring(canSubmit ? 1 : 0, { damping: 14, stiffness: 220 });
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
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: 'Create Group' }} />
        <Animated.View entering={FadeIn.duration(320)} style={styles.form}>
          <ThemedText type="subtitle">Group Details</ThemedText>
          <ThemedText style={styles.helperText} lightColor="#64748B" darkColor="#AAB4C3">
            Name your group now. Member selection will plug into the contacts flow next.
          </ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? '#1F2937' : '#F3F4F6',
                color: isDark ? 'white' : 'black',
              },
            ]}
            placeholder="Group Name"
            placeholderTextColor={isDark ? '#9CA3AF' : '#6B7280'}
            value={groupName}
            onChangeText={setGroupName}
          />
          <Animated.View style={submitAnim}>
            <ScalePressable
              style={[
                styles.button,
                { backgroundColor: canSubmit ? '#3B82F6' : '#9CA3AF' },
              ]}
              disabled={!canSubmit}
              onPress={createNewGroup}>
              <ThemedText style={styles.buttonText}>Create Group</ThemedText>
            </ScalePressable>
          </Animated.View>
        </Animated.View>
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
  },
  button: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
