/**
 * Versión web de la caché del censo: se guarda en localStorage del navegador.
 * Misma interfaz que offline.ts (SQLite en el móvil).
 */
import { Animals } from './endpoints';
import { compact, normalizeOfficialId } from './tagParser';
import type { Animal } from './types';

interface FarmCache {
  lastSync: string | null;
  animals: Record<string, Animal>;
}

const key = (farmId: string) => `ganaderia.cache.${farmId}`;
const mem: Record<string, FarmCache> = {};

function read(farmId: string): FarmCache {
  if (mem[farmId]) return mem[farmId];
  let c: FarmCache = { lastSync: null, animals: {} };
  try {
    const raw = window.localStorage.getItem(key(farmId));
    if (raw) c = JSON.parse(raw) as FarmCache;
  } catch {
    // sin almacenamiento disponible
  }
  mem[farmId] = c;
  return c;
}

function write(farmId: string, c: FarmCache): void {
  mem[farmId] = c;
  try {
    window.localStorage.setItem(key(farmId), JSON.stringify(c));
  } catch {
    // lleno: se queda en memoria
  }
}

export async function syncAnimals(farmId: string): Promise<{ updated: number; at: string }> {
  const c = read(farmId);
  const page = await Animals.sync(farmId, c.lastSync ?? undefined);
  for (const a of page.items) {
    if (a.deleted_at) delete c.animals[a.id];
    else c.animals[a.id] = a;
  }
  c.lastSync = page.server_time;
  write(farmId, c);
  return { updated: page.items.length, at: page.server_time };
}

export async function lastSync(farmId: string): Promise<string | null> {
  return read(farmId).lastSync;
}

export async function localLookup(farmId: string, code: string): Promise<Animal[]> {
  const all = Object.values(read(farmId).animals);
  const norm = normalizeOfficialId(code);
  if (norm) return all.filter((a) => a.official_id_normalized === norm);
  const c = compact(code);
  const q = code.trim().toLowerCase();
  return all
    .filter(
      (a) =>
        a.internal_id === c ||
        (a.official_id_normalized ?? '').endsWith(c) ||
        (!!q && (a.name ?? '').toLowerCase().includes(q)),
    )
    .slice(0, 20);
}

export async function clearCache(): Promise<void> {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k?.startsWith('ganaderia.cache.')) window.localStorage.removeItem(k);
    }
  } catch {
    // ignorado
  }
  for (const k of Object.keys(mem)) delete mem[k];
}

export async function localGet(farmId: string, id: string): Promise<Animal | null> {
  return read(farmId).animals[id] ?? null;
}
