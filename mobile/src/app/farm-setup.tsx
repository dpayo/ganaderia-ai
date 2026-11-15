import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Field, Notice, Options, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { Farms } from '@/lib/endpoints';

const SPECIES = [
  { value: 'bovino', label: 'Bovino' },
  { value: 'ovino', label: 'Ovino' },
  { value: 'caprino', label: 'Caprino' },
];

/** Alta de la primera explotación o selección entre varias. */
export default function FarmSetup() {
  const { farms, selectFarm, reloadFarms, logout } = useAuth();
  const [name, setName] = useState('');
  const [rega, setRega] = useState('');
  const [province, setProvince] = useState('');
  const [species, setSpecies] = useState('bovino');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (name.trim().length < 2) return setError('Indica el nombre de la explotación');
    setLoading(true);
    setError(null);
    try {
      const f = await Farms.create({ name: name.trim(), rega_code: rega.trim() || null, province: province.trim() || null, species_default: species });
      await reloadFarms();
      await selectFarm(f.id);
      router.replace('/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear la explotación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={[]}>
      {farms.length > 0 ? (
        <>
          <Title>Tus explotaciones</Title>
          {farms.map((f) => (
            <Button
              key={f.id}
              title={f.name}
              icon="home"
              variant="secondary"
              onPress={async () => {
                await selectFarm(f.id);
                router.replace('/home');
              }}
            />
          ))}
        </>
      ) : null}
      <Title sub="Podrás cambiar estos datos más tarde">Nueva explotación</Title>
      <Card>
        <Field label="Nombre" value={name} onChangeText={setName} placeholder="Finca El Robledal" />
        <Field label="Código REGA (opcional)" value={rega} onChangeText={setRega} autoCapitalize="characters" placeholder="ES370000000000" />
        <Field label="Provincia" value={province} onChangeText={setProvince} />
        <Options value={species} options={SPECIES} onChange={setSpecies} />
      </Card>
      {error ? <Notice tone="bad" text={error} /> : null}
      <Button title="Crear explotación" icon="add-circle" onPress={create} loading={loading} />
      {farms.length === 0 ? <Button title="Cerrar sesión" variant="ghost" onPress={logout} /> : null}
    </Screen>
  );
}
