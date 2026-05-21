import React, { useState } from "react";
import { StyleSheet, View, TextInput, Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function CreateGroupScreen() {
  const [groupName, setGroupName] = useState('');
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Create Group' }} />
      <View style={styles.form}>
        <ThemedText type="subtitle">Group Details</ThemedText>
        <TextInput
          style={[styles.input, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6', color: isDark ? 'white' : 'black' }]}
          placeholder="Group Name"
          placeholderTextColor={isDark ? '#9CA3AF' : '#6B7280'}
          value={groupName}
          onChangeText={setGroupName}
        />
        <Pressable
          style={[styles.button, { backgroundColor: groupName ? '#3B82F6' : '#9CA3AF' }]}
          disabled={!groupName}
          onPress={() => router.back()}
        >
          <ThemedText style={styles.buttonText}>Create Group</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  form: {
    gap: 16,
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
