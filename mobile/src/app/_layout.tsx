import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export default function RootLayout() {
  const t = useTheme();
  const navTheme = t.dark ? DarkTheme : DefaultTheme;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider
            value={{
              ...navTheme,
              colors: { ...navTheme.colors, primary: t.primary, background: t.bg, card: t.surface, text: t.text, border: t.border },
            }}
          >
            <StatusBar style={t.dark ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerBackTitle: 'Atrás', headerTitleStyle: { fontWeight: '700' } }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="farm-setup" options={{ title: 'Explotación' }} />
              <Stack.Screen name="identify/camera" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
              <Stack.Screen name="identify/result" options={{ title: 'Resultado' }} />
              <Stack.Screen name="identify/manual" options={{ title: 'Buscar identificador' }} />
              <Stack.Screen name="animal/[id]" options={{ title: 'Ficha' }} />
              <Stack.Screen name="animal/form" options={{ title: 'Animal', presentation: 'modal' }} />
              <Stack.Screen name="settings" options={{ title: 'Configuración' }} />
            </Stack>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
