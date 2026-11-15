import { Redirect } from 'expo-router';

import { Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function Index() {
  const { ready, user, farm } = useAuth();
  if (!ready) return <Loading label="Cargando…" />;
  if (!user) return <Redirect href="/login" />;
  if (!farm) return <Redirect href="/farm-setup" />;
  return <Redirect href="/home" />;
}
