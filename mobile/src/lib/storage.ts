import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Almacén clave-valor: llavero seguro en el móvil, localStorage en la versión web. */
const web = Platform.OS === 'web';

function ls(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export async function getItem(key: string): Promise<string | null> {
  if (web) return ls()?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (web) {
    try {
      ls()?.setItem(key, value);
    } catch {
      // almacenamiento lleno o bloqueado: la sesión dura lo que la pestaña
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (web) {
    try {
      ls()?.removeItem(key);
    } catch {
      // ignorado
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
