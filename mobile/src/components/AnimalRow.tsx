import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { formatOfficialId } from '@/lib/tagParser';
import { font, radius, space, useTheme } from '@/lib/theme';
import { type Animal, SEX_LABEL, STATUS_LABEL } from '@/lib/types';

import { AuthImage, Badge } from './ui';

export function animalTitle(a: Pick<Animal, 'official_id' | 'official_id_normalized' | 'internal_id' | 'name'>): string {
  return a.name || formatOfficialId(a.official_id_normalized) || a.internal_id || 'Animal';
}

export function AnimalRow({ animal, onPress, right }: { animal: Animal; onPress: () => void; right?: React.ReactNode }) {
  const t = useTheme();
  const official = formatOfficialId(animal.official_id_normalized);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ficha de ${animalTitle(animal)}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md,
        backgroundColor: t.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: t.border,
        opacity: pressed ? 0.85 : 1,
        minHeight: 84,
      })}
    >
      <AuthImage path={animal.main_photo_thumb_url} style={{ width: 60, height: 60, borderRadius: radius.md }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontSize: font.lg, fontWeight: '700' }} numberOfLines={1}>
          {animal.name || official || animal.internal_id}
        </Text>
        {animal.name && official ? (
          <Text style={{ color: t.textMuted, fontSize: font.md }} numberOfLines={1}>
            {official}
          </Text>
        ) : null}
        <Text style={{ color: t.textMuted, fontSize: font.sm }} numberOfLines={1}>
          {[SEX_LABEL[animal.sex], animal.breed, animal.herd_group_name].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {right ??
        (animal.status !== 'active' ? (
          <Badge label={STATUS_LABEL[animal.status]} tone="warn" />
        ) : (
          <Ionicons name="chevron-forward" size={22} color={t.textMuted} />
        ))}
    </Pressable>
  );
}
