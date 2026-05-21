import { StyleSheet, View } from 'react-native';

import { SettingsRow } from '@/components/settings-row';
import { ThemedText } from '@/components/themed-text';
import type { SettingsSection as SettingsSectionType } from '@/constants/profile-data';
import { useColorScheme } from '@/hooks/use-color-scheme';

type SettingsSectionProps = {
  section: SettingsSectionType;
  onToggle?: (id: string, enabled: boolean) => void;
};

export function SettingsSection({ section, onToggle }: SettingsSectionProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';

  return (
    <View style={styles.wrapper}>
      <ThemedText type="defaultSemiBold" style={styles.heading} lightColor="#475569" darkColor="#D8DEE9">
        {section.title}
      </ThemedText>
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
            borderColor: isDark ? '#2F3A4A' : '#E8EEF8',
          },
        ]}>
        {section.items.map((item, index) => (
          <SettingsRow
            key={item.id}
            item={item}
            isLast={index === section.items.length - 1}
            onToggle={onToggle}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 10,
  },
  heading: {
    paddingHorizontal: 4,
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  card: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 24,
  },
});
