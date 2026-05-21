import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { SettingsItem } from '@/constants/profile-data';
import { useColorScheme } from '@/hooks/use-color-scheme';

type SettingsRowProps = {
  item: SettingsItem;
  isLast?: boolean;
  onToggle?: (id: string, enabled: boolean) => void;
};

export function SettingsRow({ item, isLast, onToggle }: SettingsRowProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const handlePress = () => {
    if (item.hasToggle) {
      onToggle?.(item.id, !item.enabled);
      return;
    }

    Alert.alert(item.title, 'This setting screen will be connected in the next build pass.');
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomColor: isDark ? '#2F3A4A' : '#EDF2F7',
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          opacity: pressed ? 0.72 : 1,
        },
      ]}>
      <View style={[styles.iconWrap, { backgroundColor: isDark ? '#243044' : '#EEF5FF' }]}>
        <MaterialIcons name={item.icon} size={22} color="#3B82F6" />
      </View>

      <View style={styles.copy}>
        <ThemedText type="defaultSemiBold" style={styles.title}>
          {item.title}
        </ThemedText>
        <ThemedText style={styles.subtitle} lightColor="#64748B" darkColor="#AAB4C3">
          {item.subtitle}
        </ThemedText>
      </View>

      {item.hasToggle ? (
        <Switch
          value={item.enabled}
          onValueChange={(enabled) => onToggle?.(item.id, enabled)}
          trackColor={{ false: isDark ? '#334155' : '#CBD5E1', true: '#93C5FD' }}
          thumbColor={item.enabled ? '#2563EB' : '#F8FAFC'}
        />
      ) : (
        <View style={styles.valueWrap}>
          {item.value ? (
            <ThemedText style={styles.value} lightColor="#64748B" darkColor="#AAB4C3">
              {item.value}
            </ThemedText>
          ) : null}
          <MaterialIcons name="chevron-right" size={22} color={isDark ? '#748095' : '#94A3B8'} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  valueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  value: {
    fontSize: 13,
  },
});
