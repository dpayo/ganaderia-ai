import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimalRow } from '@/components/AnimalRow';
import { Chip, Empty, ErrorView, Loading } from '@/components/ui';
import { useFarm } from '@/lib/auth';
import { type AnimalFilters, Animals, Farms } from '@/lib/endpoints';
import { font, radius, space, TOUCH, useTheme } from '@/lib/theme';
import type { AnimalStatus, Sex } from '@/lib/types';

const PAGE = 30;

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function AnimalsScreen() {
  const t = useTheme();
  const farm = useFarm();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<AnimalStatus | undefined>('active');
  const [sex, setSex] = useState<Sex | undefined>();
  const [group, setGroup] = useState<string | undefined>();
  const q = useDebounced(text.trim());
  const filters: AnimalFilters = { q: q || undefined, status, sex, group_id: group, sort: 'official_id' };

  const groups = useQuery({ queryKey: ['groups', farm.id], queryFn: () => Farms.groups(farm.id) });
  const list = useInfiniteQuery({
    queryKey: ['animals', farm.id, filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => Animals.list(farm.id, { ...filters, limit: PAGE, offset: pageParam }),
    getNextPageParam: (last) => (last.offset + last.limit < last.total ? last.offset + last.limit : undefined),
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <View style={{ padding: space.lg, paddingBottom: space.sm, gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: font.xxl, fontWeight: '800', color: t.text }}>Animales</Text>
          <Text style={{ color: t.textMuted, fontSize: font.md }}>{list.isSuccess ? `${total} resultados` : ''}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, paddingHorizontal: space.md, minHeight: TOUCH }}>
          <Ionicons name="search" size={22} color={t.textMuted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Crotal, nº de manejo, nombre o raza"
            placeholderTextColor={t.textMuted}
            style={{ flex: 1, fontSize: font.lg, color: t.text, paddingHorizontal: space.sm }}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Buscar animales"
          />
          {text ? (
            <Pressable onPress={() => setText('')} hitSlop={10} accessibilityLabel="Borrar búsqueda">
              <Ionicons name="close-circle" size={22} color={t.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          <Chip label="Activos" selected={status === 'active'} onPress={() => setStatus(status === 'active' ? undefined : 'active')} />
          <Chip label="Bajas" selected={status === 'sold'} onPress={() => setStatus(status === 'sold' ? undefined : 'sold')} />
          <Chip label="Hembras" selected={sex === 'female'} onPress={() => setSex(sex === 'female' ? undefined : 'female')} />
          <Chip label="Machos" selected={sex === 'male'} onPress={() => setSex(sex === 'male' ? undefined : 'male')} />
          {groups.data?.map((g) => (
            <Chip key={g.id} label={g.name} selected={group === g.id} onPress={() => setGroup(group === g.id ? undefined : g.id)} />
          ))}
        </ScrollView>
      </View>

      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorView error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.sm, paddingBottom: 140 }}
          renderItem={({ item }) => <AnimalRow animal={item} onPress={() => router.push(`/animal/${item.id}`)} />}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          refreshing={list.isRefetching && !list.isFetchingNextPage}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={
            <Empty
              icon="paw-outline"
              title={q ? 'Sin resultados' : 'Aún no hay animales'}
              text={q ? 'Prueba con otro identificador o quita filtros.' : 'Registra tu primer animal o impórtalos desde Excel en Configuración.'}
            />
          }
        />
      )}

      <Pressable
        onPress={() => router.push('/animal/form')}
        accessibilityRole="button"
        accessibilityLabel="Nuevo animal"
        style={({ pressed }) => ({
          position: 'absolute',
          right: space.lg,
          bottom: space.lg,
          backgroundColor: t.primary,
          borderRadius: radius.pill,
          paddingHorizontal: space.xl,
          height: TOUCH + 4,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          opacity: pressed ? 0.85 : 1,
          elevation: 4,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 6,
        })}
      >
        <Ionicons name="add" size={26} color={t.onPrimary} />
        <Text style={{ color: t.onPrimary, fontWeight: '800', fontSize: font.lg }}>Nuevo</Text>
      </Pressable>
    </SafeAreaView>
  );
}
