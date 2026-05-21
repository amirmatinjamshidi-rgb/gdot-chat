import React from "react";
import { StyleSheet, FlatList, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, { FadeInRight } from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScalePressable } from "@/components/ui/scale-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";

const MOCK_CHATS = [
  { id: '1', name: 'Alice', lastMessage: 'Hey, how are you?', time: '10:30 AM', unread: 2 },
  { id: '2', name: 'Bob', lastMessage: 'Did you see the latest update?', time: 'Yesterday', unread: 0 },
  { id: '3', name: 'Charlie', lastMessage: 'Meeting at 5?', time: 'Yesterday', unread: 1 },
];

export default function ChatsScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
        <Animated.View entering={FadeInRight.springify()}>
          <ThemedView style={styles.header}>
            <ThemedText type="title">Chats</ThemedText>
            <ScalePressable style={styles.iconButton} onPress={() => router.push('/Contacts')}>
              <IconSymbol name="person.badge.plus" size={24} color={isDark ? "#FFFFFF" : "#000000"} />
            </ScalePressable>
          </ThemedView>
        </Animated.View>

      <FlatList
        style={styles.list}
        data={MOCK_CHATS}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInRight.delay(Math.min(index, 8) * 45).springify()}>
            <ScalePressable
              style={styles.chatItem}
              onPress={() =>
                router.push({
                  pathname: '/ChatRoom',
                  params: { id: item.id, name: item.name },
                })
              }>
              <View style={[styles.avatar, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]}>
                <ThemedText>{item.name[0]}</ThemedText>
              </View>
              <View style={styles.chatInfo}>
                <View style={styles.chatHeader}>
                  <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
                  <ThemedText style={styles.timeText}>{item.time}</ThemedText>
                </View>
                <View style={styles.chatFooter}>
                  <ThemedText numberOfLines={1} style={styles.lastMessage}>
                    {item.lastMessage}
                  </ThemedText>
                  {item.unread > 0 && (
                    <View style={styles.unreadBadge}>
                      <ThemedText style={styles.unreadText}>{item.unread}</ThemedText>
                    </View>
                  )}
                </View>
              </View>
            </ScalePressable>
          </Animated.View>
        )}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]} />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  header: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    padding: 8,
  },
  chatItem: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatInfo: {
    flex: 1,
    gap: 4,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 12,
    opacity: 0.5,
  },
  chatFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    opacity: 0.7,
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  separator: {
    height: 1,
    marginLeft: 78,
  },
});
