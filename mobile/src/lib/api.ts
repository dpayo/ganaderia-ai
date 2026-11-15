import * as SecureStore from 'expo-secure-store';

import { API_PREFIX, API_URL } from './config';
import type { Tokens } from './types';

const TOKENS_KEY = 'ganaderia.tokens';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

let tokens: Tokens | null = null;
let onAuthLost: (() => void) | null = null;
let refreshing: Promise<boolean> | null = null;

export async function loadTokens(): Promise<Tokens | null> {
  const raw = await SecureStore.getItemAsync(TOKENS_KEY);
  tokens = raw ? (JSON.parse(raw) as Tokens) : null;
  return tokens;
}

export async function setTokens(t: Tokens | null): Promise<void> {
  tokens = t;
  if (t) await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(t));
  else await SecureStore.deleteItemAsync(TOKENS_KEY);
}

export function setOnAuthLost(cb: (() => void) | null): void {
  onAuthLost = cb;
}

export function authHeaders(): Record<string, string> {
  return tokens ? { Authorization: `Bearer ${tokens.access_token}` } : {};
}

/** URL absoluta para rutas relativas devueltas por la API (p. ej. fotos). */
export function absoluteUrl(path: string): string {
  return path.startsWith('http') ? path : `${API_URL}${path}`;
}

function detailMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) {
      return d
        .map((e: { msg?: string; loc?: unknown[] }) => {
          const field = Array.isArray(e.loc) ? String(e.loc[e.loc.length - 1]) : '';
          return `${field ? `${field}: ` : ''}${(e.msg ?? '').replace(/^Value error, /, '')}`;
        })
        .join('\n');
    }
  }
  return status >= 500 ? 'Error del servidor. Inténtalo de nuevo.' : `Error ${status}`;
}

async function tryRefresh(): Promise<boolean> {
  if (!tokens) return false;
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${API_URL}${API_PREFIX}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: tokens?.refresh_token }),
      });
      if (!r.ok) return false;
      await setTokens((await r.json()) as Tokens);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
}

export async function api<T>(path: string, opts: RequestOptions = {}, retry = true): Promise<T> {
  const qs = opts.query
    ? '?' +
      Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const headers: Record<string, string> = { Accept: 'application/json', ...authHeaders() };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${API_PREFIX}${path}${qs === '?' ? '' : qs}`, {
      method: opts.method ?? 'GET',
      headers,
      body,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'Sin conexión con el servidor. Comprueba la cobertura o la wifi.');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return api<T>(path, opts, false);
    await setTokens(null);
    onAuthLost?.();
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json: unknown = text ? safeJson(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, detailMessage(json, res.status), json);
  return json as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** FormData con una imagen local (file://) para subir. */
export function imageForm(uri: string, fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  // React Native acepta { uri, name, type } como fichero en FormData.
  fd.append('file', { uri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}
