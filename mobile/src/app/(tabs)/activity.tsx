import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhaseCard } from '@/components/PhaseScreen';
import { Card, Empty, ErrorView, type IconName, Loading, SectionTitle } from '@/components/ui';
import { useFarm } from '@/lib/auth';
import { Farms } from '@/lib/endpoints';
import { font, space, useTheme } from '@/lib/theme';
import type { ActivityItem } from '@/lib/types';

const ICONS: Record<string, IconName> = {
  animal: 'paw',
  animal_photo: 'image',
  identification: 'scan',
  herd_group: 'albums',
  farm: 'home',
  farm_user: 'people',
};

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Activity() {
  const t = useTheme();
  const farm = useFarm();
  const q = useQuery({ queryKey: ['activity', farm.id], queryFn: () => Farms.activity(farm.id) });

  const header = (
    <View style={{ gap: space.lg, marginBottom: space.md }}>
      <Text style={{ fontSize: font.xxl, fontWeight: '800', color: t.text }}>Actividad</Text>
      <PhaseCard phase={2} title="Próximos registros" icon="medkit" items={['Sanidad, vacunas y tratamientos', 'Nacimientos', 'Movimientos y traslados', 'Alimentación y costes', 'Calendario con avisos']} />
      <SectionTitle>Registro de cambios</SectionTitle>
    </View>
  );

  const renderItem = ({ item }: { item: ActivityItem }) => (
    <Card
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
      onPress={item.entity === 'animal' && item.action !== 'delete' ? () => router.push(`/animal/${item.entity_id}`) : undefined}
    >
      <Ionicons name={ICONS[item.entity] ?? 'ellipse'} size={24} color={t.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: '700', fontSize: font.md }}>{item.summary}</Text>
        <Text style={{ color: t.textMuted, fontSize: font.sm }}>
          {when(item.created_at)}
          {item.user_name ? ` · ${item.user_name}` : ''}
        </Text>
      </View>
    </Card>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      {q.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(i) => String(i.id)}
          ListHeaderComponent={header}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          contentContainerStyle={{ padding: space.lg, paddingBottom: 120 }}
          refreshing={q.isRefetching}
          onRefresh={() => void q.refetch()}
          ListEmptyComponent={q.error ? <ErrorView error={q.error} onRetry={() => q.refetch()} /> : <Empty icon="time-outline" title="Sin actividad todavía" />}
        />
      )}
    </SafeAreaView>
  );
}
