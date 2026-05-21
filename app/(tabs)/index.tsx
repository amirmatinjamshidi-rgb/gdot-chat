import { StyleSheet, View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ScalePressable } from '@/components/ui/scale-pressable';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.springify()}>
          <ThemedView style={styles.header}>
            <ThemedText type="title">Smash</ThemedText>
            <ThemedText style={styles.subtitle}>Connect and chat instantly</ThemedText>
          </ThemedView>
        </Animated.View>

        <View style={styles.grid}>
          <Animated.View
            entering={FadeInDown.delay(60).springify()}
            style={styles.gridCell}>
            <ScalePressable
              style={[styles.card, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}
              onPress={() => router.push('/(tabs)/chats')}>
              <IconSymbol name="bubble.left.and.bubble.right.fill" size={32} color="#3B82F6" />
              <ThemedText type="subtitle">Messages</ThemedText>
              <ThemedText style={styles.cardDescription}>View your conversations</ThemedText>
            </ScalePressable>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(110).springify()}
            style={styles.gridCell}>
            <ScalePressable
              style={[styles.card, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}
              onPress={() => router.push('/Contacts')}>
              <IconSymbol name="person.2.fill" size={32} color="#10B981" />
              <ThemedText type="subtitle">Contacts</ThemedText>
              <ThemedText style={styles.cardDescription}>See who is online</ThemedText>
            </ScalePressable>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(160).springify()}
            style={styles.gridCell}>
            <ScalePressable
              style={[styles.card, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}
              onPress={() => router.push('/CreateGroup')}>
              <IconSymbol name="person.3.fill" size={32} color="#F59E0B" />
              <ThemedText type="subtitle">Groups</ThemedText>
              <ThemedText style={styles.cardDescription}>Create a new group</ThemedText>
            </ScalePressable>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(210).springify()}
            style={styles.gridCell}>
            <ScalePressable
              style={[styles.card, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}
              onPress={() => router.push('/(tabs)/profile')}>
              <IconSymbol name="person.crop.circle.fill" size={32} color="#8B5CF6" />
              <ThemedText type="subtitle">Profile</ThemedText>
              <ThemedText style={styles.cardDescription}>Manage your settings</ThemedText>
            </ScalePressable>
          </Animated.View>
        </View>

        <Animated.View entering={FadeInDown.delay(260).springify()}>
          <ThemedView style={styles.recentSection}>
            <ThemedText type="subtitle">Quick Actions</ThemedText>
            <View style={styles.actionList}>
              <ScalePressable style={styles.actionItem} onPress={() => router.push('/modal')}>
                <ThemedText>Open quick action preview</ThemedText>
                <IconSymbol name="chevron.right" size={16} color="#64748B" />
              </ScalePressable>
            </View>
          </ThemedView>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 24,
  },
  header: {
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  gridCell: {
    width: '47%',
    minWidth: 0,
  },
  card: {
    width: '100%',
    padding: 16,
    borderRadius: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardDescription: {
    fontSize: 12,
    opacity: 0.6,
  },
  recentSection: {
    gap: 12,
  },
  actionList: {
    gap: 8,
  },
  actionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
});
