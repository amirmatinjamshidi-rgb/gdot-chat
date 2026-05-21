import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function SecuritySummaryCard() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';

  return (
    <Pressable
      onPress={() =>
        Alert.alert(
          'Safety checkup',
          'Security review screens will be connected when account flows are added.'
        )
      }
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: isDark ? '#10251E' : '#ECFDF5',
          borderColor: isDark ? '#1F4D3B' : '#BBF7D0',
          opacity: pressed ? 0.78 : 1,
        },
      ]}>
      <View style={styles.iconWrap}>
        <MaterialIcons name="lock" size={24} color="#16A34A" />
      </View>
      <View style={styles.copy}>
        <ThemedText type="defaultSemiBold" style={styles.title}>
          Safety checkup
        </ThemedText>
        <ThemedText style={styles.subtitle} lightColor="#4B7360" darkColor="#A7F3D0">
          Two-step verification, device sessions, and privacy controls are ready to review.
        </ThemedText>
      </View>
      <MaterialIcons name="chevron-right" size={24} color={isDark ? '#A7F3D0' : '#16A34A'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 26,
    padding: 18,
    gap: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
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
