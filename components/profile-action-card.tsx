import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Alert, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ScalePressable } from '@/components/ui/scale-pressable';
import type { ProfileAction } from '@/constants/profile-data';
import { useColorScheme } from '@/hooks/use-color-scheme';

type ProfileActionCardProps = {
  action: ProfileAction;
};

const toneColors = {
  primary: '#3B82F6',
  success: '#22C55E',
  warning: '#F97316',
};

export function ProfileActionCard({ action }: ProfileActionCardProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const toneColor = toneColors[action.tone];

  return (
    <ScalePressable
      onPress={() =>
        Alert.alert(action.title, `${action.title} management will be connected to real data later.`)
      }
      style={[
        styles.card,
        {
          backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
          borderColor: isDark ? '#2F3A4A' : '#E8EEF8',
        },
      ]}>
      <View style={[styles.iconWrap, { backgroundColor: `${toneColor}20` }]}>
        <MaterialIcons name={action.icon} size={22} color={toneColor} />
      </View>
      <ThemedText type="defaultSemiBold" style={styles.value}>
        {action.value}
      </ThemedText>
      <ThemedText style={styles.title} lightColor="#64748B" darkColor="#AAB4C3">
        {action.title}
      </ThemedText>
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    width: "100%",
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 24,
    padding: 14,
    gap: 8,
  },
  iconWrap: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
  },
  value: {
    fontSize: 20,
    lineHeight: 24,
  },
  title: {
    fontSize: 13,
    lineHeight: 18,
  },
});
