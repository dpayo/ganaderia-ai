import type { Identification } from './types';

/**
 * Traspaso del resultado de identificación entre la cámara y la pantalla de resultado
 * (evita serializar objetos grandes en los parámetros de la ruta).
 */
let current: { result: Identification; localPhotoUri: string | null } | null = null;

export const identifyStore = {
  set(result: Identification, localPhotoUri: string | null) {
    current = { result, localPhotoUri };
  },
  get() {
    return current;
  },
  clear() {
    current = null;
  },
};
