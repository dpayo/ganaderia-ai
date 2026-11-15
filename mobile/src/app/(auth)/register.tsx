import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text } from 'react-native';

import { Button, Field, Notice, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export default function Register() {
  const t = useTheme();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (name.trim().length < 2) return setError('Indica tu nombre');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Email no válido');
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres');
    if (!accepted) return setError('Debes aceptar la política de privacidad');
    setLoading(true);
    try {
      await register(email, password, name);
      router.replace('/farm-setup');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Title sub="Solo te llevará un minuto">Crear cuenta</Title>
        <Field label="Nombre y apellidos" value={name} onChangeText={setName} autoComplete="name" />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry hint="Mínimo 8 caracteres" autoComplete="new-password" />
        <Button
          title={accepted ? '✓ Acepto la política de privacidad (RGPD)' : 'Aceptar política de privacidad (RGPD)'}
          variant={accepted ? 'primary' : 'secondary'}
          compact
          onPress={() => setAccepted((v) => !v)}
        />
        <Text style={{ color: t.textMuted, fontSize: 13 }}>
          Tus datos y fotografías se guardan cifrados en servidores de la UE y solo los ven los usuarios de tu explotación.
          Ganadería AI no sustituye a los sistemas oficiales de identificación y trazabilidad.
        </Text>
        {error ? <Notice tone="bad" icon="alert-circle" text={error} /> : null}
        <Button title="Crear cuenta" icon="person-add" onPress={submit} loading={loading} />
        <Button title="Ya tengo cuenta" variant="ghost" onPress={() => router.back()} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
