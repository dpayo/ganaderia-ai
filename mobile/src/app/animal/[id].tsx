import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { showAlert } from '@/lib/alert';

import { animalTitle } from '@/components/AnimalRow';
import { NotAvailableYet } from '@/components/PhaseScreen';
import { AuthImage, Badge, Button, Card, ErrorView, Loading, Notice, Options, Row, Screen, SectionTitle } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useFarm } from '@/lib/auth';
import { Animals } from '@/lib/endpoints';
import { prepareForUpload } from '@/lib/image';
import { localGet } from '@/lib/offline';
import { formatOfficialId, managementNumber } from '@/lib/tagParser';
import { radius, space, useTheme } from '@/lib/theme';
import { type AnimalDetail, HEALTH_LABEL, SEX_LABEL, STATUS_LABEL } from '@/lib/types';

function age(birth: string | null): string {
  if (!birth) return '—';
  const b = new Date(birth);
  const now = new Date();
  let months = (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth();
  if (now.getDate() < b.getDate()) months -= 1;
  if (months < 1) return `${Math.max(0, Math.floor((now.getTime() - b.getTime()) / 86400000))} días`;
  if (months < 24) return `${months} meses`;
  return `${Math.floor(months / 12)} años`;
}

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('es-ES') : '—');

export default function AnimalScreen() {
  const t = useTheme();
  const farm = useFarm();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [offline, setOffline] = useState(false);
  const [exitMode, setExitMode] = useState<'sold' | 'dead' | 'transferred' | null>(null);

  const q = useQuery({
    queryKey: ['animal', id],
    queryFn: async (): Promise<AnimalDetail> => {
      try {
        const a = await Animals.get(farm.id, id);
        setOffline(false);
        return a;
      } catch (e) {
        if (e instanceof ApiError && e.isNetwork) {
          const local = await localGet(farm.id, id);
          if (local) {
            setOffline(true);
            return { ...local, mother: null, father: null, photos: [] };
          }
        }
        throw e;
      }
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['animal', id] });
    qc.invalidateQueries({ queryKey: ['animals', farm.id] });
    qc.invalidateQueries({ queryKey: ['dashboard', farm.id] });
  };

  const upload = useMutation({
    mutationFn: async (fromCamera: boolean) => {
      const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : { granted: true };
      if (!perm.granted) throw new Error('Permiso de cámara denegado');
      const r = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      const asset = r.canceled ? null : r.assets[0];
      if (!asset) return null;
      return Animals.uploadPhoto(farm.id, id, await prepareForUpload(asset.uri, asset.width));
    },
    onSuccess: refresh,
    onError: (e) => showAlert('Foto', e instanceof Error ? e.message : 'Error al subir la foto'),
  });

  const deactivate = useMutation({
    mutationFn: (status: 'sold' | 'dead' | 'transferred') =>
      Animals.deactivate(farm.id, id, status, new Date().toISOString().slice(0, 10)),
    onSuccess: () => {
      setExitMode(null);
      refresh();
    },
    onError: (e) => showAlert('Baja', e instanceof Error ? e.message : 'Error'),
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const a = q.data;
  const official = formatOfficialId(a.official_id_normalized);
  const manage = managementNumber(a.official_id_normalized);
  const main = a.photos.find((p) => p.id === a.main_photo_id) ?? a.photos[0];

  return (
    <>
      <Stack.Screen
        options={{
          title: animalTitle(a),
          headerRight: () =>
            offline ? null : (
              <Pressable onPress={() => router.push(`/animal/form?id=${a.id}`)} hitSlop={12} accessibilityLabel="Editar">
                <Ionicons name="create-outline" size={26} color={t.primary} />
              </Pressable>
            ),
        }}
      />
      <Screen edges={[]}>
        {offline ? <Notice tone="warn" icon="cloud-offline" text="Sin conexión: mostrando la copia guardada en el móvil (sin fotos ni edición)." /> : null}
        <AuthImage path={main?.url ?? a.main_photo_thumb_url} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          {manage ? (
            <View style={{ backgroundColor: t.accent, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
              <Text style={{ fontSize: 34, fontWeight: '900', color: t.onAccent }} accessibilityLabel={`Número de manejo ${manage}`}>
                {manage}
              </Text>
            </View>
          ) : null}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: t.text }}>{official || a.internal_id}</Text>
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              <Badge label={STATUS_LABEL[a.status]} tone={a.status === 'active' ? 'good' : 'warn'} />
              <Badge label={HEALTH_LABEL[a.health_status]} tone={a.health_status === 'healthy' ? 'good' : a.health_status === 'unknown' ? 'neutral' : 'bad'} />
            </View>
          </View>
        </View>

        <Card>
          <Row label="Identificador oficial" value={official || '—'} />
          <Row label="Identificador interno" value={a.internal_id || '—'} />
          {a.name ? <Row label="Nombre" value={a.name} /> : null}
          <Row label="Especie" value={a.species} />
          <Row label="Raza" value={a.breed || '—'} />
          <Row label="Sexo" value={SEX_LABEL[a.sex]} />
          <Row label="Nacimiento" value={`${fmtDate(a.birth_date)} (${age(a.birth_date)})`} />
          <Row label="Peso" value={a.weight_kg ? `${Number(a.weight_kg).toLocaleString('es-ES')} kg` : '—'} />
          <Row label="Lote" value={a.herd_group_name || 'Sin lote'} />
          <Row label="Explotación" value={farm.name} />
          {a.status !== 'active' ? <Row label="Fecha de baja" value={`${fmtDate(a.status_date)}${a.status_reason ? ` · ${a.status_reason}` : ''}`} /> : null}
        </Card>

        <Card>
          <SectionTitle>Genealogía</SectionTitle>
          <Row label="Madre" value={a.mother ? <Pressable onPress={() => router.push(`/animal/${a.mother?.id}`)}><Text style={{ color: t.primary, fontWeight: '700' }}>{animalTitle({ ...a.mother, official_id_normalized: a.mother.official_id })}</Text></Pressable> : 'Desconocida'} />
          <Row label="Padre" value={a.father ? <Pressable onPress={() => router.push(`/animal/${a.father?.id}`)}><Text style={{ color: t.primary, fontWeight: '700' }}>{animalTitle({ ...a.father, official_id_normalized: a.father.official_id })}</Text></Pressable> : 'Desconocido'} />
        </Card>

        {a.notes ? (
          <Card>
            <SectionTitle>Observaciones</SectionTitle>
            <Text style={{ color: t.text, fontSize: 16 }}>{a.notes}</Text>
          </Card>
        ) : null}

        <Card>
          <SectionTitle right={<Text style={{ color: t.textMuted }}>{a.photos.length}</Text>}>Galería</SectionTitle>
          {a.photos.length ? (
            <FlatList
              horizontal
              data={a.photos}
              keyExtractor={(p) => p.id}
              ItemSeparatorComponent={() => <View style={{ width: space.sm }} />}
              renderItem={({ item }) => (
                <View>
                  <AuthImage path={item.thumb_url} style={{ width: 110, height: 110, borderRadius: radius.md }} />
                  {item.id === a.main_photo_id ? (
                    <View style={{ position: 'absolute', top: 6, left: 6 }}>
                      <Badge label="Principal" tone="info" />
                    </View>
                  ) : null}
                </View>
              )}
            />
          ) : (
            <Text style={{ color: t.textMuted }}>Sin fotos. Añade una o identifica al animal con la cámara.</Text>
          )}
          {!offline ? (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title="Cámara" icon="camera" variant="secondary" style={{ flex: 1 }} loading={upload.isPending} onPress={() => upload.mutate(true)} />
              <Button title="Galería" icon="images" variant="secondary" style={{ flex: 1 }} disabled={upload.isPending} onPress={() => upload.mutate(false)} />
            </View>
          ) : null}
        </Card>

        <Card>
          <SectionTitle>Historial sanitario y movimientos</SectionTitle>
          <NotAvailableYet phase={2} />
        </Card>

        {a.status === 'active' && !offline ? (
          <Card>
            <SectionTitle>Dar de baja</SectionTitle>
            <Options
              value={exitMode}
              onChange={setExitMode}
              options={[
                { value: 'sold', label: 'Venta' },
                { value: 'dead', label: 'Muerte' },
                { value: 'transferred', label: 'Traslado' },
              ]}
            />
            {exitMode ? (
              <Button
                title={`Confirmar baja por ${exitMode === 'sold' ? 'venta' : exitMode === 'dead' ? 'muerte' : 'traslado'} (hoy)`}
                variant="danger"
                icon="exit"
                loading={deactivate.isPending}
                onPress={() =>
                  showAlert('Confirmar baja', 'El animal dejará de contar en el censo activo. El historial se conserva.', [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Dar de baja', style: 'destructive', onPress: () => deactivate.mutate(exitMode) },
                  ])
                }
              />
            ) : null}
            <Text style={{ color: t.textMuted, fontSize: 13 }}>Recuerda notificar la baja también en el sistema oficial (SITRAN / tu comunidad autónoma).</Text>
          </Card>
        ) : null}
      </Screen>
    </>
  );
}
