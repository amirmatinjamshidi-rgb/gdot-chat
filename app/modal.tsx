import { StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ScalePressable } from '@/components/ui/scale-pressable';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ModalScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Quick Action' }} />
      <Animated.View entering={FadeInDown.springy()} style={styles.cardWrap}>
        <Animated.View
          entering={ZoomIn.springify()}
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
              borderColor: isDark ? '#2F3A4A' : '#E8EEF8',
            },
          ]}>
          <ThemedText type="title" style={styles.title}>
            Coming soon
          </ThemedText>
          <ThemedText style={styles.copy} lightColor="#64748B" darkColor="#AAB4C3">
            This modal is restored so the Home quick action has a valid route. It can become a
            compose menu, QR scanner, or invite flow later.
          </ThemedText>
          <ScalePressable style={styles.button} onPress={() => router.back()}>
            <ThemedText style={styles.buttonText}>Close</ThemedText>
          </ScalePressable>
        </Animated.View>
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  cardWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 30,
  },
  copy: {
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#3B82F6',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
