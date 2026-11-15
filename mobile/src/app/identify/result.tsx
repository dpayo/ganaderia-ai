import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Text, View } from 'react-native';

import { AnimalRow } from '@/components/AnimalRow';
import { Badge, Button, Card, ConfidenceBar, Empty, Notice, Screen, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { Identify } from '@/lib/endpoints';
import { identifyStore } from '@/lib/identifyStore';
import { formatOfficialId } from '@/lib/tagParser';
import { font, radius, space, useTheme } from '@/lib/theme';
import type { Match } from '@/lib/types';

const MATCHED_BY: Record<Match['matched_by'], string> = {
  official_exact: 'Crotal oficial exacto',
  official_fuzzy: 'Crotal con 1 dígito distinto — revisa',
  management_suffix: 'Por número de manejo',
  internal_id: 'Por identificador interno',
};

export default function Result() {
  const t = useTheme();
  const { farm } = useAuth();
  const qc = useQueryClient();
  const data = identifyStore.get();
  const [saving, setSaving] = useState<string | null>(null);

  if (!farm || !data) {
    return (
      <Screen edges={[]}>
        <Empty icon="scan-outline" title="No hay ninguna identificación en curso" action={<Button title="Abrir cámara" icon="camera" onPress={() => router.replace('/identify/camera')} />} />
      </Screen>
    );
  }
  const { result, localPhotoUri } = data;
  const fromPhoto = result.id !== null;
  const bestOfficial = result.candidates.find((c) => c.value.startsWith('ES'));

  const confirm = async (m: Match) => {
    if (!result.id) {
      router.replace(`/animal/${m.animal.id}`);
      return;
    }
    setSaving(m.animal.id);
    try {
      await Identify.confirm(farm.id, result.id, m.animal.id, true);
      identifyStore.clear();
      qc.invalidateQueries({ queryKey: ['animal', m.animal.id] });
      qc.invalidateQueries({ queryKey: ['dashboard', farm.id] });
      router.replace(`/animal/${m.animal.id}`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo confirmar');
    } finally {
      setSaving(null);
    }
  };

  const rejectAndRetry = async () => {
    if (result.id) await Identify.reject(farm.id, result.id).catch(() => undefined);
    identifyStore.clear();
    router.replace('/identify/camera');
  };

  const createNew = () => {
    const params = new URLSearchParams();
    if (bestOfficial) params.set('official_id', bestOfficial.value);
    if (result.id) params.set('identification_id', result.id);
    router.replace(`/animal/form?${params.toString()}`);
  };

  const tone = result.status === 'matched' ? 'good' : result.status === 'unreadable' ? 'bad' : 'warn';

  return (
    <Screen edges={[]}>
      {localPhotoUri ? <Image source={{ uri: localPhotoUri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg }} resizeMode="cover" /> : null}
      <Notice tone={tone} icon={tone === 'good' ? 'checkmark-circle' : 'alert-circle'} text={result.message} />

      {result.candidates.length > 0 ? (
        <Card>
          <SectionTitle>{fromPhoto ? 'Leído en el crotal' : 'Buscado'}</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {result.candidates.slice(0, 4).map((c) => (
              <Badge key={c.value} label={c.value.startsWith('ES') ? formatOfficialId(c.value) : `Nº ${c.value}`} tone={c.value.startsWith('ES') ? 'info' : 'neutral'} />
            ))}
          </View>
          {result.processing_ms !== null ? (
            <Text style={{ color: t.textMuted, fontSize: 12 }}>
              OCR: {result.ocr_provider} · {(result.processing_ms / 1000).toFixed(1)} s
            </Text>
          ) : null}
        </Card>
      ) : null}

      {result.matches.length > 0 ? (
        <View style={{ gap: space.md }}>
          <SectionTitle>{result.matches.length === 1 ? '¿Es este animal?' : 'Elige el animal correcto'}</SectionTitle>
          {result.matches.slice(0, 5).map((m) => (
            <Card key={m.animal.id}>
              <AnimalRow animal={m.animal} onPress={() => router.push(`/animal/${m.animal.id}`)} />
              <Text style={{ color: t.textMuted, fontSize: font.sm }}>{MATCHED_BY[m.matched_by]}</Text>
              <ConfidenceBar value={m.confidence} />
              <Button
                title={fromPhoto ? 'Sí, es este · guardar foto' : 'Abrir ficha'}
                icon="checkmark"
                loading={saving === m.animal.id}
                onPress={() => confirm(m)}
              />
            </Card>
          ))}
        </View>
      ) : null}

      <SectionTitle>{result.matches.length ? '¿No es ninguno?' : 'Opciones'}</SectionTitle>
      {result.status === 'not_found' && bestOfficial ? (
        <Button title={`Dar de alta ${formatOfficialId(bestOfficial.value)}`} icon="add-circle" onPress={createNew} />
      ) : null}
      {fromPhoto ? <Button title="Repetir fotografía" icon="camera-reverse" variant="secondary" onPress={rejectAndRetry} /> : null}
      <Button title="Introducir identificador manualmente" icon="keypad" variant="secondary" onPress={() => router.replace('/identify/manual')} />
      <Button title="Buscar entre mis animales" icon="search" variant="secondary" onPress={() => router.replace('/animals')} />
      {result.status !== 'not_found' || !bestOfficial ? <Button title="Registrar como animal nuevo" icon="add" variant="secondary" onPress={createNew} /> : null}
      <Button
        title="Coincidencias visuales (Fase 3)"
        icon="eye"
        variant="secondary"
        disabled={!result.visual_search_available}
        onPress={() => undefined}
      />
      {!result.visual_search_available ? (
        <Text style={{ color: t.textMuted, fontSize: font.sm }}>
          El reconocimiento visual del animal aún no está disponible: se validará con fotos confirmadas de tu propia explotación antes de activarlo.
        </Text>
      ) : null}
    </Screen>
  );
}
