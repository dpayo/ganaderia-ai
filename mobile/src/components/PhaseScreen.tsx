import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { font, space, useTheme } from '@/lib/theme';

import { Card, type IconName, Notice } from './ui';

/** Módulo aún no implementado: se explica qué hará, sin simular datos. */
export function PhaseCard({ phase, title, icon, items }: { phase: number; title: string; icon: IconName; items: string[] }) {
  const t = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Ionicons name={icon} size={24} color={t.primary} />
        <Text style={{ fontSize: font.lg, fontWeight: '700', color: t.text, flex: 1 }}>{title}</Text>
        <Text style={{ color: t.textMuted, fontWeight: '600' }}>Fase {phase}</Text>
      </View>
      {items.map((i) => (
        <Text key={i} style={{ color: t.textMuted, fontSize: font.md }}>
          • {i}
        </Text>
      ))}
    </Card>
  );
}

export function NotAvailableYet({ phase }: { phase: number }) {
  return <Notice tone="warn" icon="construct" text={`Disponible en la Fase ${phase}. Todavía no está implementado, por eso no se muestran datos.`} />;
}
