import Constants from 'expo-constants';

/**
 * URL del backend. Prioridad:
 *   1. EXPO_PUBLIC_API_URL (archivo .env de mobile/)
 *   2. Misma IP que el servidor de desarrollo de Expo, puerto 8000 (útil en Expo Go en la misma wifi)
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:8000`;
  return 'http://localhost:8000';
}

export const API_URL = resolveApiUrl();
export const API_PREFIX = '/api/v1';
