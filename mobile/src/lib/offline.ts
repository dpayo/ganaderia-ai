/**
 * Caché offline del censo (Fase 1: solo lectura).
 *
 * - Descarga incremental vía /animals/sync?since=… y guarda en SQLite.
 * - Permite buscar un animal por identificador sin cobertura (en la finca).
 * - Fase 2: cola de escrituras offline con resolución de conflictos por `version`.
 */
import * as SQLite from 'expo-sqlite';

import { Animals } from './endpoints';
import { compact, normalizeOfficialId } from './tagParser';
import type { Animal } from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function db(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const d = await SQLite.openDatabaseAsync('ganaderia.db');
    await d.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS animals (
        id TEXT PRIMARY KEY NOT NULL,
        farm_id TEXT NOT NULL,
        official_norm TEXT,
        internal_id TEXT,
        name TEXT,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_animals_farm ON animals(farm_id);
      CREATE INDEX IF NOT EXISTS ix_animals_official ON animals(farm_id, official_norm);
      CREATE TABLE IF NOT EXISTS sync_state (farm_id TEXT PRIMARY KEY NOT NULL, last_sync TEXT NOT NULL);
    `);
    return d;
  })();
  return dbPromise;
}

export async function syncAnimals(farmId: string): Promise<{ updated: number; at: string }> {
  const d = await db();
  const row = await d.getFirstAsync<{ last_sync: string }>('SELECT last_sync FROM sync_state WHERE farm_id = ?', farmId);
  const page = await Animals.sync(farmId, row?.last_sync);
  await d.withTransactionAsync(async () => {
    for (const a of page.items) {
      if (a.deleted_at) {
        await d.runAsync('DELETE FROM animals WHERE id = ?', a.id);
      } else {
        await d.runAsync(
          `INSERT OR REPLACE INTO animals (id, farm_id, official_norm, internal_id, name, json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          a.id, a.farm_id, a.official_id_normalized, a.internal_id, a.name, JSON.stringify(a), a.updated_at,
        );
      }
    }
    await d.runAsync('INSERT OR REPLACE INTO sync_state (farm_id, last_sync) VALUES (?, ?)', farmId, page.server_time);
  });
  return { updated: page.items.length, at: page.server_time };
}

export async function lastSync(farmId: string): Promise<string | null> {
  const d = await db();
  const row = await d.getFirstAsync<{ last_sync: string }>('SELECT last_sync FROM sync_state WHERE farm_id = ?', farmId);
  return row?.last_sync ?? null;
}

/** Búsqueda local: oficial exacto, nº de manejo (sufijo) o identificador interno. */
export async function localLookup(farmId: string, code: string): Promise<Animal[]> {
  const d = await db();
  const norm = normalizeOfficialId(code);
  const c = compact(code);
  const rows = norm
    ? await d.getAllAsync<{ json: string }>('SELECT json FROM animals WHERE farm_id = ? AND official_norm = ?', farmId, norm)
    : await d.getAllAsync<{ json: string }>(
        `SELECT json FROM animals WHERE farm_id = ? AND (internal_id = ? OR official_norm LIKE ? OR name LIKE ?) LIMIT 20`,
        farmId, c, `%${c}`, `%${code.trim()}%`,
      );
  return rows.map((r) => JSON.parse(r.json) as Animal);
}

export async function clearCache(): Promise<void> {
  const d = await db();
  await d.execAsync('DELETE FROM animals; DELETE FROM sync_state;');
}

export async function localGet(farmId: string, id: string): Promise<Animal | null> {
  const d = await db();
  const row = await d.getFirstAsync<{ json: string }>('SELECT json FROM animals WHERE farm_id = ? AND id = ?', farmId, id);
  return row ? (JSON.parse(row.json) as Animal) : null;
}
