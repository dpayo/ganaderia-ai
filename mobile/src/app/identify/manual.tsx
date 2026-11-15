import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { AnimalRow } from '@/components/AnimalRow';
import { Button, Field, Notice, Screen } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Animals } from '@/lib/endpoints';
import { identifyStore } from '@/lib/identifyStore';
import { localLookup } from '@/lib/offline';
import type { Animal } from '@/lib/types';

/** Entrada manual: crotal completo, nº de manejo (p. ej. 245) o identificador interno. Funciona offline. */
export default function Manual() {
  const { farm } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [offlineResults, setOfflineResults] = useState<Animal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!farm) return null;

  const search = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setOfflineResults(null);
    try {
      const r = await Animals.lookup(farm.id, code.trim());
      identifyStore.set(r, null);
      router.replace('/identify/result');
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) {
        setOfflineResults(await localLookup(farm.id, code));
      } else {
        setError(e instanceof Error ? e.message : 'Error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={[]}>
        <Field
          label="Identificador"
          value={code}
          onChangeText={setCode}
          placeholder="ES 0408 1234 5678 · 5678 · V-245"
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
          onSubmitEditing={search}
          hint="Crotal completo, número de manejo (los dígitos grandes) o identificador interno"
        />
        <Button title="Buscar" icon="search" onPress={search} loading={loading} />
        {error ? <Notice tone="bad" text={error} /> : null}
        {offlineResults ? (
          <>
            <Notice tone="warn" icon="cloud-offline" text={`Sin conexión: resultados de los datos guardados en el móvil (${offlineResults.length}).`} />
            {offlineResults.map((a) => (
              <AnimalRow key={a.id} animal={a} onPress={() => router.push(`/animal/${a.id}`)} />
            ))}
          </>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
