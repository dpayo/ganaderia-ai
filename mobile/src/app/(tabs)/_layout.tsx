import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, Tabs } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { ready, user, farm } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/login" />;
  if (!farm) return <Redirect href="/farm-setup" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.textMuted,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border, height: 68 + insets.bottom, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Inicio', tabBarIcon: ({ color }) => <Ionicons name="home" size={26} color={String(color)} /> }} />
      <Tabs.Screen name="animals" options={{ title: 'Animales', tabBarIcon: ({ color }) => <Ionicons name="list" size={26} color={String(color)} /> }} />
      <Tabs.Screen
        name="camera"
        options={{
          title: 'Cámara',
          tabBarAccessibilityLabel: 'Abrir cámara para identificar un animal',
          tabBarButton: () => (
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Abrir cámara para identificar un animal"
                onPress={() => router.push('/identify/camera')}
                style={({ pressed }) => ({
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  marginTop: -22,
                  backgroundColor: t.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 4,
                  borderColor: t.surface,
                  shadowColor: '#000',
                  shadowOpacity: 0.25,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: 6,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                })}
              >
                <Ionicons name="camera" size={34} color={t.onAccent} />
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen name="activity" options={{ title: 'Actividad', tabBarIcon: ({ color }) => <Ionicons name="pulse" size={26} color={String(color)} /> }} />
      <Tabs.Screen name="assistant" options={{ title: 'Asistente IA', tabBarIcon: ({ color }) => <Ionicons name="sparkles" size={26} color={String(color)} /> }} />
    </Tabs>
  );
}
