import React from "react";
import { StyleSheet, FlatList, Pressable, View } from "react-native";
import { Stack } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";

const MOCK_CONTACTS = [
  { id: '1', name: 'Alice', status: 'Online' },
  { id: '2', name: 'Bob', status: 'Away' },
  { id: '3', name: 'Charlie', status: 'Offline' },
  { id: '4', name: 'David', status: 'Online' },
];

export default function ContactsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Contacts' }} />
      <FlatList
        data={MOCK_CONTACTS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable style={styles.contactItem}>
            <View style={[styles.avatar, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]}>
              <ThemedText>{item.name[0]}</ThemedText>
            </View>
            <View>
              <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
              <ThemedText style={[styles.statusText, { color: item.status === 'Online' ? '#10B981' : '#6B7280' }]}>
                {item.status}
              </ThemedText>
            </View>
          </Pressable>
        )}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]} />
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contactItem: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
  },
  separator: {
    height: 1,
    marginLeft: 72,
  },
});
