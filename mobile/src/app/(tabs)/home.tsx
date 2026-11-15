import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotAvailableYet } from '@/components/PhaseScreen';
import { Button, Card, ErrorView, Notice, SectionTitle, Stat } from '@/components/ui';
import { useAuth, useFarm } from '@/lib/auth';
import { Farms } from '@/lib/endpoints';
import { lastSync, syncAnimals } from '@/lib/offline';
import { font, radius, space, useTheme } from '@/lib/theme';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function CensusChart({ data }: { data: { month: string; active: number }[] }) {
  const t = useTheme();
  const max = Math.max(1, ...data.map((d) => d.active));
  return (
    <View accessibilityLabel={`Evolución del censo. Actual: ${data[data.length - 1]?.active ?? 0} animales`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 4 }}>
        {data.map((d, i) => (
          <View key={d.month} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <View
              style={{
                width: '100%',
                height: `${Math.max(2, (d.active / max) * 100)}%`,
                backgroundColor: i === data.length - 1 ? t.accent : t.primary,
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
                opacity: i === data.length - 1 ? 1 : 0.75,
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
        {data.map((d) => (
          <Text key={d.month} style={{ flex: 1, fontSize: 10, color: t.textMuted, textAlign: 'center' }}>
            {MONTHS[Number(d.month.slice(5)) - 1]}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function Home() {
  const t = useTheme();
  const farm = useFarm();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['dashboard', farm.id], queryFn: () => Farms.dashboard(farm.id) });
  const [syncInfo, setSyncInfo] = useState<string | null>(null);

  useEffect(() => {
    // Mantiene la caché offline al día cada vez que se abre el inicio con conexión.
    syncAnimals(farm.id)
      .then((r) => setSyncInfo(`Censo disponible sin conexión · actualizado ${new Date(r.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`))
      .catch(async () => {
        const last = await lastSync(farm.id);
        setSyncInfo(last ? `Sin conexión · datos locales del ${new Date(last).toLocaleString('es-ES')}` : null);
      });
  }, [farm.id]);

  const d = q.data;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.textMuted, fontSize: font.md }}>Hola, {user?.full_name.split(' ')[0]}</Text>
            <Text style={{ color: t.text, fontSize: font.xxl, fontWeight: '800' }} numberOfLines={1}>
              {farm.name}
            </Text>
          </View>
          <Pressable accessibilityLabel="Configuración" onPress={() => router.push('/settings')} hitSlop={12} style={{ padding: space.sm }}>
            <Ionicons name="settings-outline" size={28} color={t.text} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push('/identify/camera')}
          accessibilityRole="button"
          style={({ pressed }) => ({
            backgroundColor: t.accent,
            borderRadius: radius.lg,
            padding: space.xl,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.lg,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Ionicons name="scan" size={44} color={t.onAccent} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: font.xl, fontWeight: '800', color: t.onAccent }}>Identificar animal</Text>
            <Text style={{ color: t.onAccent, fontSize: font.md }}>Fotografía el crotal</Text>
          </View>
        </Pressable>

        {syncInfo ? <Notice tone="good" icon="cloud-done" text={syncInfo} /> : null}
        {q.error ? <ErrorView error={q.error} onRetry={() => q.refetch()} /> : null}

        {d ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
              <Stat label="Animales activos" value={d.active_animals} icon="paw" />
              <Stat label="Total registrados" value={d.total_animals} icon="albums" />
              <Stat label="Nacidos este mes" value={d.births_this_month} icon="happy" tone="good" />
              <Stat label="Bajas este mes" value={d.exits_this_month} icon="exit" tone={d.exits_this_month ? 'warn' : 'neutral'} />
            </View>

            {d.alerts.length > 0 ? (
              <Card>
                <SectionTitle>Avisos</SectionTitle>
                {d.alerts.map((a) => (
                  <Notice key={a.code} tone={a.level === 'warning' ? 'warn' : a.level === 'critical' ? 'bad' : 'info'} text={a.message} />
                ))}
              </Card>
            ) : null}

            <Card>
              <SectionTitle>Evolución del censo</SectionTitle>
              <CensusChart data={d.census} />
            </Card>

            {d.by_group.length > 0 ? (
              <Card>
                <SectionTitle>Por lote</SectionTitle>
                {d.by_group.map((g) => (
                  <View key={g.name} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                    <Text style={{ color: t.text, fontSize: font.md }}>{g.name}</Text>
                    <Text style={{ color: t.text, fontSize: font.md, fontWeight: '700' }}>{g.count}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            <Card>
              <SectionTitle>Tratamientos y vacunas</SectionTitle>
              <NotAvailableYet phase={2} />
            </Card>

            {d.total_animals === 0 ? (
              <Button title="Registrar el primer animal" icon="add" onPress={() => router.push('/animal/form')} />
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
