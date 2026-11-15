import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageStyle,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { absoluteUrl, authHeaders } from '@/lib/api';
import { font, radius, space, TOUCH, useTheme } from '@/lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['top'],
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  const t = useTheme();
  const inner = padded ? { padding: space.lg, gap: space.lg } : undefined;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, { paddingBottom: 120 }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children, sub }: { children: ReactNode; sub?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: font.xxl, fontWeight: '800', color: t.text }} accessibilityRole="header">
        {children}
      </Text>
      {sub ? <Text style={{ fontSize: font.md, color: t.textMuted }}>{sub}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: font.lg, fontWeight: '700', color: t.text }}>{children}</Text>
      {right}
    </View>
  );
}

type Variant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  compact,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const t = useTheme();
  const colors: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: t.primary, fg: t.onPrimary },
    accent: { bg: t.accent, fg: t.onAccent },
    secondary: { bg: t.surface, fg: t.text, border: t.border },
    danger: { bg: t.dangerBg, fg: t.danger },
    ghost: { bg: 'transparent', fg: t.primary },
  };
  const c = colors[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [
        {
          minHeight: compact ? 44 : TOUCH,
          paddingHorizontal: space.lg,
          borderRadius: radius.md,
          backgroundColor: c.bg,
          borderWidth: c.border ? 1 : 0,
          borderColor: c.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          opacity: off ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={22} color={c.fg} /> : null}
          <Text style={{ color: c.fg, fontSize: font.lg, fontWeight: '700' }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    gap: space.sm,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

export function Field({
  label,
  error,
  hint,
  ...props
}: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.text, fontWeight: '600', fontSize: font.md }}>{label}</Text>
      <TextInput
        placeholderTextColor={t.textMuted}
        accessibilityLabel={label}
        {...props}
        style={[
          {
            minHeight: TOUCH,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: error ? t.danger : t.border,
            backgroundColor: t.surface,
            color: t.text,
            paddingHorizontal: space.md,
            fontSize: font.lg,
          },
          props.multiline ? { minHeight: 96, paddingTop: space.md, textAlignVertical: 'top' } : null,
        ]}
      />
      {error ? <Text style={{ color: t.danger }}>{error}</Text> : hint ? <Text style={{ color: t.textMuted }}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={{
        minHeight: 44,
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        justifyContent: 'center',
        backgroundColor: selected ? t.primary : t.surface,
        borderWidth: 1,
        borderColor: selected ? t.primary : t.border,
      }}
    >
      <Text style={{ color: selected ? t.onPrimary : t.text, fontWeight: '600', fontSize: font.md }}>{label}</Text>
    </Pressable>
  );
}

export function Options<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | null | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

export function Stat({ label, value, icon, tone = 'neutral' }: { label: string; value: string | number; icon: IconName; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const t = useTheme();
  const fg = { neutral: t.primary, good: t.success, warn: t.warning, bad: t.danger }[tone];
  return (
    <Card style={{ flex: 1, minWidth: '45%' }}>
      <Ionicons name={icon} size={22} color={fg} />
      <Text style={{ fontSize: font.xxl, fontWeight: '800', color: t.text }}>{value}</Text>
      <Text style={{ color: t.textMuted, fontSize: font.sm }}>{label}</Text>
    </Card>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info' }) {
  const t = useTheme();
  const map = {
    neutral: [t.surfaceAlt, t.textMuted],
    good: [t.successBg, t.success],
    warn: [t.warningBg, t.warning],
    bad: [t.dangerBg, t.danger],
    info: [t.infoBg, t.info],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </View>
  );
}

export function Notice({ text, tone = 'info', icon = 'information-circle' }: { text: string; tone?: 'info' | 'warn' | 'bad' | 'good'; icon?: IconName }) {
  const t = useTheme();
  const [bg, fg] = { info: [t.infoBg, t.info], warn: [t.warningBg, t.warning], bad: [t.dangerBg, t.danger], good: [t.successBg, t.success] }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.md, padding: space.md, flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={20} color={fg} />
      <Text style={{ color: fg, flex: 1, fontSize: font.md }}>{text}</Text>
    </View>
  );
}

export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: space.xl, gap: space.md }}>
      <Ionicons name={icon} size={48} color={t.textMuted} />
      <Text style={{ fontSize: font.lg, fontWeight: '700', color: t.text, textAlign: 'center' }}>{title}</Text>
      {text ? <Text style={{ color: t.textMuted, textAlign: 'center', fontSize: font.md }}>{text}</Text> : null}
      {action}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl, backgroundColor: t.bg }}>
      <ActivityIndicator size="large" color={t.primary} />
      {label ? <Text style={{ color: t.textMuted, fontSize: font.md }}>{label}</Text> : null}
    </View>
  );
}

/** Imagen protegida servida por la API (requiere cabecera Authorization). */
export function AuthImage({ path, style }: { path: string | null | undefined; style: StyleProp<ImageStyle> }) {
  const t = useTheme();
  if (!path) {
    return (
      <View style={[style as StyleProp<ViewStyle>, { backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="image-outline" size={28} color={t.textMuted} />
      </View>
    );
  }
  return <Image source={{ uri: absoluteUrl(path), headers: authHeaders() }} style={style} resizeMode="cover" />;
}

export function ConfidenceBar({ value }: { value: number }) {
  const t = useTheme();
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? t.success : pct >= 45 ? t.warning : t.danger;
  return (
    <View style={{ gap: 4 }} accessibilityLabel={`Confianza ${pct}%`}>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color }} />
      </View>
      <Text style={{ color, fontWeight: '700' }}>Confianza {pct}%</Text>
    </View>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.border, gap: space.md }}>
      <Text style={{ color: t.textMuted, fontSize: font.md }}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={{ color: t.text, fontSize: font.md, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Error inesperado';
  return (
    <View style={{ gap: space.md, padding: space.lg }}>
      <Notice tone="bad" icon="alert-circle" text={msg} />
      {onRetry ? <Button title="Reintentar" variant="secondary" icon="refresh" onPress={onRetry} /> : null}
    </View>
  );
}
