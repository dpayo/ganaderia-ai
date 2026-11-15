import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { animalTitle } from '@/components/AnimalRow';
import { Button, Card, Chip, Field, Loading, Notice, Options, Screen, SectionTitle } from '@/components/ui';
import { useFarm } from '@/lib/auth';
import { Animals, Farms } from '@/lib/endpoints';
import { parseDate, toDisplay } from '@/lib/dates';
import { formatOfficialId, normalizeOfficialId } from '@/lib/tagParser';
import { space, useTheme } from '@/lib/theme';
import type { AnimalInput, AnimalRef, HealthStatus, Sex } from '@/lib/types';

function ParentPicker({ label, sex, value, onChange }: { label: string; sex: Sex; value: AnimalRef | null; onChange: (a: AnimalRef | null) => void }) {
  const farm = useFarm();
  const t = useTheme();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const find = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setMsg(null);
    try {
      const r = await Animals.lookup(farm.id, code.trim());
      const m = r.matches.find((x) => x.animal.sex === sex || x.animal.sex === 'unknown');
      if (m) {
        onChange({ id: m.animal.id, official_id: m.animal.official_id_normalized, internal_id: m.animal.internal_id, name: m.animal.name });
        setCode('');
      } else setMsg('No se ha encontrado ningún animal compatible');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  };
  if (value) {
    return (
      <View style={{ gap: space.sm }}>
        <Text style={{ color: t.text, fontWeight: '600' }}>{label}</Text>
        <Chip label={`${animalTitle({ ...value, official_id_normalized: value.official_id })}  ✕`} selected onPress={() => onChange(null)} />
      </View>
    );
  }
  return (
    <View style={{ gap: space.sm }}>
      <Field label={label} value={code} onChangeText={setCode} placeholder="Crotal o nº de manejo" autoCapitalize="characters" onSubmitEditing={find} error={msg} />
      <Button title={`Buscar ${label.toLowerCase()}`} variant="secondary" compact loading={loading} onPress={find} />
    </View>
  );
}

export default function AnimalForm() {
  const farm = useFarm();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id?: string; official_id?: string; identification_id?: string }>();
  const editing = !!params.id;
  const existing = useQuery({ queryKey: ['animal', params.id], queryFn: () => Animals.get(farm.id, params.id!), enabled: editing });
  const groups = useQuery({ queryKey: ['groups', farm.id], queryFn: () => Farms.groups(farm.id) });

  const [official, setOfficial] = useState(params.official_id ? formatOfficialId(params.official_id) : '');
  const [internal, setInternal] = useState('');
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [sex, setSex] = useState<Sex>('unknown');
  const [birth, setBirth] = useState('');
  const [weight, setWeight] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus>('unknown');
  const [notes, setNotes] = useState('');
  const [mother, setMother] = useState<AnimalRef | null>(null);
  const [father, setFather] = useState<AnimalRef | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const a = existing.data;
    if (!a) return;
    setOfficial(a.official_id ?? '');
    setInternal(a.internal_id ?? '');
    setName(a.name ?? '');
    setBreed(a.breed ?? '');
    setSex(a.sex);
    setBirth(toDisplay(a.birth_date));
    setWeight(a.weight_kg ? String(Number(a.weight_kg)).replace('.', ',') : '');
    setGroupId(a.herd_group_id);
    setHealth(a.health_status);
    setNotes(a.notes ?? '');
    setMother(a.mother);
    setFather(a.father);
  }, [existing.data]);

  if (editing && existing.isLoading) return <Loading />;

  const officialNorm = normalizeOfficialId(official);
  const officialError = official.trim() && !officialNorm ? 'Formato esperado: ES + 12 dígitos' : null;

  const save = async () => {
    setError(null);
    if (officialError) return setError(officialError);
    if (!officialNorm && !internal.trim()) return setError('Indica el identificador oficial o uno interno');
    const birthIso = parseDate(birth);
    if (birthIso === 'invalid') return setError('Fecha de nacimiento no válida (dd/mm/aaaa, no futura)');
    const w = weight.trim() ? Number(weight.replace(',', '.')) : null;
    if (w !== null && (!Number.isFinite(w) || w <= 0 || w >= 5000)) return setError('Peso no válido');

    const body: AnimalInput = {
      official_id: officialNorm,
      internal_id: internal.trim() || null,
      name: name.trim() || null,
      breed: breed.trim() || null,
      sex,
      birth_date: birthIso,
      weight_kg: w,
      herd_group_id: groupId,
      health_status: health,
      notes: notes.trim() || null,
      mother_id: mother?.id ?? null,
      father_id: father?.id ?? null,
    };
    setSaving(true);
    try {
      const saved = editing
        ? await Animals.update(farm.id, params.id!, { ...body, expected_version: existing.data?.version })
        : await Animals.create(farm.id, { ...body, from_identification_id: params.identification_id ?? null });
      qc.invalidateQueries({ queryKey: ['animals', farm.id] });
      qc.invalidateQueries({ queryKey: ['dashboard', farm.id] });
      qc.setQueryData(['animal', saved.id], saved);
      router.dismiss();
      if (!editing) router.push(`/animal/${saved.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: editing ? 'Editar animal' : 'Nuevo animal' }} />
      <Screen edges={[]}>
        {params.identification_id ? <Notice tone="info" icon="camera" text="La foto del crotal se añadirá a la ficha del nuevo animal." /> : null}
        <Card>
          <SectionTitle>Identificación</SectionTitle>
          <Field label="Crotal oficial" value={official} onChangeText={setOfficial} placeholder="ES 0408 1234 5678" autoCapitalize="characters" autoCorrect={false} error={officialError} hint={officialNorm ? `✓ ${formatOfficialId(officialNorm)}` : undefined} />
          <Field label="Identificador interno (opcional)" value={internal} onChangeText={setInternal} autoCapitalize="characters" placeholder="V-245" />
          <Field label="Nombre (opcional)" value={name} onChangeText={setName} />
        </Card>
        <Card>
          <SectionTitle>Datos</SectionTitle>
          <Text style={{ fontWeight: '600', fontSize: 16 }}>Sexo</Text>
          <Options value={sex} onChange={setSex} options={[{ value: 'female', label: 'Hembra' }, { value: 'male', label: 'Macho' }, { value: 'unknown', label: 'Sin indicar' }]} />
          <Field label="Raza" value={breed} onChangeText={setBreed} placeholder="Avileña-Negra Ibérica" />
          <Field label="Fecha de nacimiento" value={birth} onChangeText={setBirth} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" />
          <Field label="Peso (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="42" />
          <Text style={{ fontWeight: '600', fontSize: 16 }}>Estado sanitario</Text>
          <Options value={health} onChange={setHealth} options={[{ value: 'healthy', label: 'Sano' }, { value: 'observation', label: 'Observación' }, { value: 'sick', label: 'Enfermo' }, { value: 'unknown', label: 'Sin evaluar' }]} />
        </Card>
        <Card>
          <SectionTitle>Lote</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Chip label="Sin lote" selected={groupId === null} onPress={() => setGroupId(null)} />
            {groups.data?.map((g) => <Chip key={g.id} label={g.name} selected={groupId === g.id} onPress={() => setGroupId(g.id)} />)}
          </View>
        </Card>
        <Card>
          <SectionTitle>Genealogía</SectionTitle>
          <ParentPicker label="Madre" sex="female" value={mother} onChange={setMother} />
          <ParentPicker label="Padre" sex="male" value={father} onChange={setFather} />
        </Card>
        <Field label="Observaciones" value={notes} onChangeText={setNotes} multiline />
        {error ? <Notice tone="bad" icon="alert-circle" text={error} /> : null}
        <Button title={editing ? 'Guardar cambios' : 'Registrar animal'} icon="save" onPress={save} loading={saving} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
