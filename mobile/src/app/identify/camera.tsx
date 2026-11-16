import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { showAlert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Screen, Title } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Identify } from '@/lib/endpoints';
import { identifyStore } from '@/lib/identifyStore';
import { prepareForUpload } from '@/lib/image';
import { font, radius, space } from '@/lib/theme';

function RoundButton({ icon, label, onPress, active }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ alignItems: 'center', gap: 4, width: 76 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: active ? '#F2B636' : 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={26} color={active ? '#1B1D1A' : '#fff'} />
      </View>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

export default function CameraScreen() {
  const { farm } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  if (!farm) return null;

  const process = async (uri: string, width?: number) => {
    setBusy('Leyendo crotal…');
    try {
      const small = await prepareForUpload(uri, width);
      const result = await Identify.photo(farm.id, small);
      identifyStore.set(result, small);
      Haptics.notificationAsync(result.status === 'matched' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      router.replace('/identify/result');
    } catch (e) {
      const offline = e instanceof ApiError && e.isNetwork;
      showAlert(
        offline ? 'Sin conexión' : 'No se pudo procesar',
        offline
          ? 'La lectura automática del crotal necesita conexión. Puedes escribir el número y buscarlo en los datos guardados en el móvil.'
          : e instanceof Error ? e.message : 'Error desconocido',
        [
          { text: 'Repetir', style: 'cancel' },
          { text: 'Escribir número', onPress: () => router.replace('/identify/manual') },
        ],
      );
    } finally {
      setBusy(null);
    }
  };

  const shoot = async () => {
    if (!camera.current || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.9, exif: false });
      if (pic) await process(pic.uri, pic.width);
    } catch {
      showAlert('Cámara', 'No se pudo hacer la foto. Inténtalo de nuevo.');
    }
  };

  const pickFromGallery = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    const asset = r.canceled ? null : r.assets[0];
    if (asset) await process(asset.uri, asset.width);
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (!permission.granted) {
    return (
      <Screen>
        <Title sub="Se usa para fotografiar crotales e identificar animales">Permiso de cámara</Title>
        <Button title="Permitir cámara" icon="camera" onPress={requestPermission} />
        <Button title="Elegir foto de la galería" variant="secondary" icon="images" onPress={pickFromGallery} />
        <Button title="Escribir identificador" variant="secondary" icon="keypad" onPress={() => router.replace('/identify/manual')} />
        <Button title="Cerrar" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={camera} style={{ flex: 1 }} facing="back" enableTorch={torch} zoom={zoom} autofocus="on" animateShutter />
      {/* Superposición: guía de encuadre del crotal */}
      <SafeAreaView style={{ position: 'absolute', inset: 0, justifyContent: 'space-between' }} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space.lg }}>
          <RoundButton icon="close" label="Cerrar" onPress={() => router.back()} />
          <RoundButton icon={torch ? 'flash' : 'flash-off'} label="Linterna" active={torch} onPress={() => setTorch((v) => !v)} />
          <RoundButton icon="add" label={zoom > 0 ? 'Zoom x2' : 'Zoom'} active={zoom > 0} onPress={() => setZoom((z) => (z > 0 ? 0 : 0.25))} />
        </View>

        <View pointerEvents="none" style={{ alignItems: 'center', gap: space.md }}>
          <View style={{ width: '82%', aspectRatio: 1.25, borderWidth: 3, borderColor: '#F2B636', borderRadius: radius.lg }} />
          <Text style={{ color: '#fff', fontSize: font.lg, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 6, textAlign: 'center', paddingHorizontal: space.xl }}>
            Encuadra el crotal completo, de frente y sin reflejos
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: space.xl, paddingHorizontal: space.lg }}>
          <RoundButton icon="images" label="Galería" onPress={pickFromGallery} />
          <Pressable
            onPress={shoot}
            disabled={!!busy}
            accessibilityRole="button"
            accessibilityLabel="Hacer foto del crotal"
            style={({ pressed }) => ({ width: 88, height: 88, borderRadius: 44, borderWidth: 6, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
          >
            <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: '#F2B636' }} />
          </Pressable>
          <RoundButton icon="keypad" label="Escribir" onPress={() => router.replace('/identify/manual')} />
        </View>
      </SafeAreaView>

      {busy ? (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', gap: space.lg }}>
          <ActivityIndicator size="large" color="#F2B636" />
          <Text style={{ color: '#fff', fontSize: font.xl, fontWeight: '700' }}>{busy}</Text>
        </View>
      ) : null}
    </View>
  );
}
