import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button, Field, Notice, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { API_URL } from '@/lib/config';
import { font, space, useTheme } from '@/lib/theme';

export default function Login() {
  const t = useTheme();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email || !password) return setError('Introduce email y contraseña');
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ alignItems: 'center', gap: space.sm, marginTop: space.xxl, marginBottom: space.lg }}>
          <View style={{ backgroundColor: t.primary, borderRadius: 28, padding: space.lg }}>
            <Ionicons name="leaf" size={44} color={t.onPrimary} />
          </View>
          <Text style={{ fontSize: 32, fontWeight: '800', color: t.text }}>Ganadería AI</Text>
          <Text style={{ color: t.textMuted, fontSize: font.md, textAlign: 'center' }}>
            Gestiona tu explotación e identifica animales con la cámara
          </Text>
        </View>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" />
        <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} />
        {error ? <Notice tone="bad" icon="alert-circle" text={error} /> : null}
        <Button title="Entrar" icon="log-in" onPress={submit} loading={loading} />
        <Button title="Crear cuenta nueva" variant="ghost" onPress={() => router.push('/register')} />
        <Text style={{ color: t.textMuted, textAlign: 'center', fontSize: 12 }}>Servidor: {API_URL}</Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
