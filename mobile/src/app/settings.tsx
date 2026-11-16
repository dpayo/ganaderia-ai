import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { showAlert } from '@/lib/alert';

import { Button, Card, Field, Notice, Options, Row, Screen, SectionTitle } from '@/components/ui';
import { authHeaders } from '@/lib/api';
import { useAuth, useFarm } from '@/lib/auth';
import { API_PREFIX, API_URL } from '@/lib/config';
import { Animals, Farms } from '@/lib/endpoints';
import { syncAnimals } from '@/lib/offline';
import { space, useTheme } from '@/lib/theme';
import { type ImportReport, type Role, ROLE_LABEL } from '@/lib/types';

const ADMIN: Role[] = ['owner', 'manager'];

export default function Settings() {
  const t = useTheme();
  const farm = useFarm();
  const { user, farms, logout, reloadFarms } = useAuth();
  const qc = useQueryClient();
  const isAdmin = !!farm.role && ADMIN.includes(farm.role);

  const [name, setName] = useState(farm.name);
  const [rega, setRega] = useState(farm.rega_code ?? '');
  const [province, setProvince] = useState(farm.province ?? '');
  const [newGroup, setNewGroup] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<Role>('worker');
  const [report, setReport] = useState<{ r: ImportReport; file: DocumentPicker.DocumentPickerAsset } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const groups = useQuery({ queryKey: ['groups', farm.id], queryFn: () => Farms.groups(farm.id) });
  const members = useQuery({ queryKey: ['members', farm.id], queryFn: () => Farms.members(farm.id) });

  const err = (e: unknown) => showAlert('Error', e instanceof Error ? e.message : 'Error');

  const saveFarm = useMutation({
    mutationFn: () => Farms.update(farm.id, { name: name.trim(), rega_code: rega.trim() || null, province: province.trim() || null }),
    onSuccess: async () => {
      await reloadFarms();
      showAlert('Guardado', 'Datos de la explotación actualizados');
    },
    onError: err,
  });
  const addGroup = useMutation({
    mutationFn: () => Farms.createGroup(farm.id, newGroup.trim()),
    onSuccess: () => {
      setNewGroup('');
      qc.invalidateQueries({ queryKey: ['groups', farm.id] });
    },
    onError: err,
  });
  const addMember = useMutation({
    mutationFn: () => Farms.addMember(farm.id, memberEmail.trim(), memberRole),
    onSuccess: () => {
      setMemberEmail('');
      qc.invalidateQueries({ queryKey: ['members', farm.id] });
    },
    onError: err,
  });

  const exportFile = async (format: 'csv' | 'xlsx') => {
    setBusy(format);
    try {
      if (Platform.OS === 'web') {
        const r = await fetch(`${API_URL}${API_PREFIX}/farms/${farm.id}/animals/export?format=${format}`, { headers: authHeaders() });
        if (!r.ok) throw new Error(`Error ${r.status} al exportar`);
        const url = URL.createObjectURL(await r.blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = `animales_${farm.name.replace(/\W+/g, '_')}.${format}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return;
      }
      const dest = new File(Paths.cache, `animales_${farm.name.replace(/\W+/g, '_')}.${format}`);
      const f = await File.downloadFileAsync(`${API_URL}${API_PREFIX}/farms/${farm.id}/animals/export?format=${format}`, dest, {
        headers: authHeaders(),
        idempotent: true,
      });
      await Sharing.shareAsync(f.uri, {
        mimeType: format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Exportar animales',
      });
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  };

  const importFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      copyToCacheDirectory: true,
    });
    const file = r.canceled ? null : r.assets[0];
    if (!file) return;
    setBusy('import');
    try {
      const rep = await Animals.importFile(farm.id, file.uri, file.name, file.mimeType ?? 'text/csv', true, file.file);
      setReport({ r: rep, file });
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  };

  const confirmImport = async () => {
    if (!report) return;
    setBusy('import');
    try {
      const rep = await Animals.importFile(farm.id, report.file.uri, report.file.name, report.file.mimeType ?? 'text/csv', false, report.file.file);
      setReport(null);
      qc.invalidateQueries({ queryKey: ['animals', farm.id] });
      qc.invalidateQueries({ queryKey: ['dashboard', farm.id] });
      await syncAnimals(farm.id).catch(() => undefined);
      showAlert('Importación completada', `${rep.created} animales creados${rep.errors.length ? `, ${rep.errors.length} filas con errores` : ''}.`);
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen edges={[]}>
      <Card>
        <SectionTitle>Explotación</SectionTitle>
        <Field label="Nombre" value={name} onChangeText={setName} editable={isAdmin} />
        <Field label="Código REGA" value={rega} onChangeText={setRega} autoCapitalize="characters" editable={isAdmin} />
        <Field label="Provincia" value={province} onChangeText={setProvince} editable={isAdmin} />
        {isAdmin ? <Button title="Guardar" icon="save" loading={saveFarm.isPending} onPress={() => saveFarm.mutate()} /> : null}
        <Row label="Tu rol" value={farm.role ? ROLE_LABEL[farm.role] : '—'} />
      </Card>

      <Card>
        <SectionTitle>Lotes</SectionTitle>
        {groups.data?.map((g) => (
          <Row
            key={g.id}
            label={g.name}
            value={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Text style={{ color: t.text, fontWeight: '700' }}>{g.animal_count}</Text>
                {isAdmin ? (
                  <Button
                    title="Borrar"
                    variant="ghost"
                    compact
                    onPress={() =>
                      showAlert('Borrar lote', `Los animales de "${g.name}" quedarán sin lote.`, [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Borrar', style: 'destructive', onPress: () => Farms.deleteGroup(farm.id, g.id).then(() => qc.invalidateQueries({ queryKey: ['groups', farm.id] })).catch(err) },
                      ])
                    }
                  />
                ) : null}
              </View>
            }
          />
        ))}
        <Field label="Nuevo lote" value={newGroup} onChangeText={setNewGroup} placeholder="Nodrizas, Recría, Cebo…" />
        <Button title="Añadir lote" icon="add" variant="secondary" disabled={!newGroup.trim()} loading={addGroup.isPending} onPress={() => addGroup.mutate()} />
      </Card>

      <Card>
        <SectionTitle>Usuarios</SectionTitle>
        {members.data?.map((m) => <Row key={m.user_id} label={m.full_name} value={ROLE_LABEL[m.role]} />)}
        {isAdmin ? (
          <>
            <Field label="Email del usuario (debe tener cuenta)" value={memberEmail} onChangeText={setMemberEmail} autoCapitalize="none" keyboardType="email-address" />
            <Options value={memberRole} onChange={setMemberRole} options={(['manager', 'worker', 'vet', 'viewer'] as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
            <Button title="Dar acceso" icon="person-add" variant="secondary" disabled={!memberEmail.trim()} loading={addMember.isPending} onPress={() => addMember.mutate()} />
          </>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>Datos</SectionTitle>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title="CSV" icon="download" variant="secondary" style={{ flex: 1 }} loading={busy === 'csv'} onPress={() => exportFile('csv')} />
          <Button title="Excel" icon="download" variant="secondary" style={{ flex: 1 }} loading={busy === 'xlsx'} onPress={() => exportFile('xlsx')} />
        </View>
        {isAdmin ? <Button title="Importar CSV / Excel" icon="cloud-upload" variant="secondary" loading={busy === 'import' && !report} onPress={importFile} /> : null}
        {report ? (
          <View style={{ gap: space.sm }}>
            <Notice
              tone={report.r.errors.length ? 'warn' : 'good'}
              text={`Revisión: ${report.r.total_rows} filas · ${report.r.created} se crearán · ${report.r.errors.length} con errores`}
            />
            {report.r.errors.slice(0, 8).map((e) => (
              <Text key={e.row} style={{ color: t.danger }}>
                Fila {e.row}: {e.error}
              </Text>
            ))}
            <Button title={`Importar ${report.r.created} animales`} icon="checkmark" disabled={report.r.created === 0} loading={busy === 'import'} onPress={confirmImport} />
            <Button title="Cancelar" variant="ghost" onPress={() => setReport(null)} />
          </View>
        ) : null}
        <Text style={{ color: t.textMuted, fontSize: 13 }}>
          Columnas: identificador_oficial; identificador_interno; nombre; especie; raza; sexo; fecha_nacimiento; fecha_entrada; peso_kg; lote; observaciones
        </Text>
      </Card>

      <Card>
        <SectionTitle>Cuenta</SectionTitle>
        <Row label="Usuario" value={user?.email ?? ''} />
        <Row label="Servidor" value={API_URL} />
        {farms.length > 1 ? <Button title="Cambiar de explotación" icon="swap-horizontal" variant="secondary" onPress={() => router.push('/farm-setup')} /> : null}
        <Button title="Nueva explotación" icon="add-circle" variant="secondary" onPress={() => router.push('/farm-setup')} />
        <Button
          title="Cerrar sesión"
          icon="log-out"
          variant="danger"
          onPress={async () => {
            await logout();
            qc.clear();
            router.replace('/login');
          }}
        />
      </Card>
      <Text style={{ color: t.textMuted, fontSize: 12, textAlign: 'center' }}>
        Ganadería AI v0.1 · No sustituye a los sistemas oficiales de identificación y trazabilidad.
      </Text>
    </Screen>
  );
}
