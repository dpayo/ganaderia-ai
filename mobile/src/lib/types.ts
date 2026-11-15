// Tipos que reflejan los esquemas de la API (backend/app/schemas.py).

export type Role = 'owner' | 'manager' | 'worker' | 'vet' | 'viewer';
export type Sex = 'male' | 'female' | 'unknown';
export type AnimalStatus = 'active' | 'sold' | 'dead' | 'transferred';
export type HealthStatus = 'healthy' | 'observation' | 'sick' | 'treatment' | 'unknown';
export type IdentStatus = 'matched' | 'ambiguous' | 'not_found' | 'unreadable' | 'confirmed' | 'rejected';

export interface Tokens {
  access_token: string;
  refresh_token: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
}

export interface Farm {
  id: string;
  name: string;
  rega_code: string | null;
  species_default: string;
  province: string | null;
  municipality: string | null;
  role: Role | null;
}

export interface HerdGroup {
  id: string;
  name: string;
  description: string | null;
  animal_count: number;
}

export interface Animal {
  id: string;
  farm_id: string;
  official_id: string | null;
  official_id_normalized: string | null;
  internal_id: string | null;
  name: string | null;
  species: string;
  breed: string | null;
  sex: Sex;
  birth_date: string | null;
  entry_date: string | null;
  weight_kg: string | null;
  mother_id: string | null;
  father_id: string | null;
  herd_group_id: string | null;
  herd_group_name: string | null;
  status: AnimalStatus;
  status_date: string | null;
  status_reason: string | null;
  health_status: HealthStatus;
  main_photo_id: string | null;
  main_photo_thumb_url: string | null;
  notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AnimalRef {
  id: string;
  official_id: string | null;
  internal_id: string | null;
  name: string | null;
}

export interface Photo {
  id: string;
  animal_id: string | null;
  kind: 'tag' | 'body' | 'face' | 'other';
  width: number;
  height: number;
  created_at: string;
  url: string;
  thumb_url: string;
}

export interface AnimalDetail extends Animal {
  mother: AnimalRef | null;
  father: AnimalRef | null;
  photos: Photo[];
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Candidate {
  value: string;
  kind: 'official' | 'electronic' | 'official_no_prefix' | 'management' | 'internal';
  confidence: number;
}

export interface Match {
  animal: Animal;
  confidence: number;
  matched_by: 'official_exact' | 'official_fuzzy' | 'management_suffix' | 'internal_id';
  matched_value: string;
}

export interface Identification {
  id: string | null;
  status: IdentStatus;
  ocr_provider: string | null;
  ocr_available: boolean;
  raw_text: string | null;
  candidates: Candidate[];
  matches: Match[];
  photo_id: string | null;
  photo_url: string | null;
  processing_ms: number | null;
  visual_search_available: boolean;
  message: string;
}

export interface Dashboard {
  total_animals: number;
  active_animals: number;
  births_this_month: number;
  exits_this_month: number;
  exits_total: number;
  by_sex: Record<string, number>;
  by_group: { group_id: string | null; name: string; count: number }[];
  census: { month: string; active: number }[];
  alerts: { level: 'info' | 'warning' | 'critical'; code: string; message: string; count: number }[];
  pending_treatments: number | null;
  upcoming_vaccinations: number | null;
}

export interface ActivityItem {
  id: number;
  entity: string;
  entity_id: string;
  action: string;
  summary: string;
  user_name: string | null;
  created_at: string;
  changes: Record<string, unknown> | null;
}

export interface ImportReport {
  dry_run: boolean;
  total_rows: number;
  created: number;
  errors: { row: number; error: string }[];
}

export interface AnimalInput {
  official_id?: string | null;
  internal_id?: string | null;
  name?: string | null;
  species?: string | null;
  breed?: string | null;
  sex?: Sex | null;
  birth_date?: string | null;
  entry_date?: string | null;
  weight_kg?: number | null;
  mother_id?: string | null;
  father_id?: string | null;
  herd_group_id?: string | null;
  health_status?: HealthStatus | null;
  notes?: string | null;
  from_identification_id?: string | null;
  expected_version?: number;
}

export const SEX_LABEL: Record<Sex, string> = { male: 'Macho', female: 'Hembra', unknown: 'Sin indicar' };
export const STATUS_LABEL: Record<AnimalStatus, string> = {
  active: 'Activo',
  sold: 'Vendido',
  dead: 'Muerto',
  transferred: 'Trasladado',
};
export const HEALTH_LABEL: Record<HealthStatus, string> = {
  healthy: 'Sano',
  observation: 'En observación',
  sick: 'Enfermo',
  treatment: 'En tratamiento',
  unknown: 'Sin evaluar',
};
export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Titular',
  manager: 'Gestor',
  worker: 'Operario',
  vet: 'Veterinario',
  viewer: 'Solo lectura',
};
