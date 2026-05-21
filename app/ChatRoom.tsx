import React, { useState } from "react";
import { StyleSheet, View, FlatList, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColorScheme } from "@/hooks/use-color-scheme";

const MOCK_MESSAGES = [
  { id: '1', text: 'Hey Alice!', sender: 'me', time: '10:30 AM' },
  { id: '2', text: 'Hi! How is the project going?', sender: 'Alice', time: '10:31 AM' },
  { id: '3', text: 'It is going great! Just setting up the routes.', sender: 'me', time: '10:32 AM' },
];

export default function ChatRoomScreen() {
  const { name } = useLocalSearchParams<{ id: string, name: string }>();
  const [message, setMessage] = useState('');
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: name || 'Chat', headerBackTitle: 'Chats' }} />

      <FlatList
        data={MOCK_MESSAGES}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => (
          <View style={[
            styles.messageBubble,
            item.sender === 'me' ? styles.myMessage : styles.theirMessage,
            { backgroundColor: item.sender === 'me' ? '#3B82F6' : (isDark ? '#374151' : '#E5E7EB') }
          ]}>
            <ThemedText style={{ color: item.sender === 'me' ? 'white' : (isDark ? 'white' : 'black') }}>
              {item.text}
            </ThemedText>
            <ThemedText style={[styles.timeText, { color: item.sender === 'me' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)' }]}>
              {item.time}
            </ThemedText>
          </View>
        )}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={[styles.inputContainer, { borderTopColor: isDark ? '#374151' : '#E5E7EB' }]}>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6', color: isDark ? 'white' : 'black' }]}
            placeholder="Type a message..."
            placeholderTextColor={isDark ? '#9CA3AF' : '#6B7280'}
            value={message}
            onChangeText={setMessage}
          />
          <Pressable style={styles.sendButton} onPress={() => setMessage('')}>
            <IconSymbol name="paperplane.fill" size={24} color="white" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messageList: {
    padding: 16,
    gap: 12,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 18,
    maxWidth: '80%',
  },
  myMessage: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  timeText: {
    fontSize: 10,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#3B82F6',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
