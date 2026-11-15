import { api, imageForm } from './api';
import type {
  ActivityItem,
  Animal,
  AnimalDetail,
  AnimalInput,
  AnimalStatus,
  Dashboard,
  Farm,
  HerdGroup,
  Identification,
  ImportReport,
  Page,
  Photo,
  Role,
  Sex,
  Tokens,
  User,
} from './types';

export const Auth = {
  login: (email: string, password: string) =>
    api<Tokens>('/auth/login', { method: 'POST', body: { email, password } }),
  register: (email: string, password: string, full_name: string) =>
    api<Tokens>('/auth/register', { method: 'POST', body: { email, password, full_name } }),
  me: () => api<User>('/auth/me'),
};

export const Farms = {
  list: () => api<Farm[]>('/farms'),
  create: (body: Partial<Farm> & { name: string }) => api<Farm>('/farms', { method: 'POST', body }),
  update: (id: string, body: Partial<Farm>) => api<Farm>(`/farms/${id}`, { method: 'PATCH', body }),
  members: (id: string) =>
    api<{ user_id: string; email: string; full_name: string; role: Role }[]>(`/farms/${id}/members`),
  addMember: (id: string, email: string, role: Role) =>
    api(`/farms/${id}/members`, { method: 'POST', body: { email, role } }),
  groups: (id: string) => api<HerdGroup[]>(`/farms/${id}/groups`),
  createGroup: (id: string, name: string) =>
    api<HerdGroup>(`/farms/${id}/groups`, { method: 'POST', body: { name } }),
  deleteGroup: (id: string, gid: string) => api<void>(`/farms/${id}/groups/${gid}`, { method: 'DELETE' }),
  dashboard: (id: string) => api<Dashboard>(`/farms/${id}/dashboard`),
  activity: (id: string) => api<ActivityItem[]>(`/farms/${id}/activity`),
};

export interface AnimalFilters {
  q?: string;
  status?: AnimalStatus;
  group_id?: string;
  sex?: Sex;
  sort?: 'recent' | 'official_id' | 'birth_date' | 'name';
  limit?: number;
  offset?: number;
}

export const Animals = {
  list: (farmId: string, f: AnimalFilters = {}) =>
    api<Page<Animal>>(`/farms/${farmId}/animals`, { query: { ...f } }),
  get: (farmId: string, id: string) => api<AnimalDetail>(`/farms/${farmId}/animals/${id}`),
  create: (farmId: string, body: AnimalInput) =>
    api<AnimalDetail>(`/farms/${farmId}/animals`, { method: 'POST', body }),
  update: (farmId: string, id: string, body: AnimalInput) =>
    api<AnimalDetail>(`/farms/${farmId}/animals/${id}`, { method: 'PATCH', body }),
  deactivate: (farmId: string, id: string, status: 'sold' | 'dead' | 'transferred', date: string, reason?: string) =>
    api<Animal>(`/farms/${farmId}/animals/${id}/deactivate`, { method: 'POST', body: { status, date, reason } }),
  remove: (farmId: string, id: string) => api<void>(`/farms/${farmId}/animals/${id}`, { method: 'DELETE' }),
  sync: (farmId: string, since?: string) =>
    api<{ items: Animal[]; server_time: string }>(`/farms/${farmId}/animals/sync`, { query: { since } }),
  lookup: (farmId: string, code: string) =>
    api<Identification>(`/farms/${farmId}/animals/lookup`, { query: { code } }),
  uploadPhoto: (farmId: string, id: string, uri: string, setAsMain = false) =>
    api<Photo>(`/farms/${farmId}/animals/${id}/photos`, {
      method: 'POST',
      form: imageForm(uri, { kind: 'body', set_as_main: String(setAsMain) }),
      timeoutMs: 60000,
    }),
  deletePhoto: (farmId: string, photoId: string) =>
    api<void>(`/farms/${farmId}/photos/${photoId}`, { method: 'DELETE' }),
  importFile: (farmId: string, uri: string, name: string, mime: string, dryRun: boolean) => {
    const fd = new FormData();
    fd.append('file', { uri, name, type: mime } as unknown as Blob);
    return api<ImportReport>(`/farms/${farmId}/animals/import`, {
      method: 'POST',
      form: fd,
      query: { dry_run: dryRun },
      timeoutMs: 120000,
    });
  },
};

export const Identify = {
  photo: (farmId: string, uri: string) =>
    api<Identification>(`/farms/${farmId}/identify`, { method: 'POST', form: imageForm(uri), timeoutMs: 60000 }),
  confirm: (farmId: string, identId: string, animalId: string, attachPhoto = true) =>
    api<void>(`/farms/${farmId}/identifications/${identId}/confirm`, {
      method: 'POST',
      body: { animal_id: animalId, attach_photo: attachPhoto },
    }),
  reject: (farmId: string, identId: string) =>
    api<void>(`/farms/${farmId}/identifications/${identId}/reject`, { method: 'POST' }),
  capabilities: () =>
    api<{ ocr: { provider: string; available: boolean }; visual_recognition: { available: boolean } }>(
      '/capabilities',
    ),
};
