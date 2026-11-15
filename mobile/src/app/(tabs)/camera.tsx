import { Redirect } from 'expo-router';

// La pestaña Cámara abre /identify/camera a pantalla completa (ver (tabs)/_layout.tsx).
// Si se llega aquí por deep link, se redirige.
export default function CameraTab() {
  return <Redirect href="/identify/camera" />;
}
