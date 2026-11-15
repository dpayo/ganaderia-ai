/**
 * Normalización de identificadores de crotales españoles en el dispositivo.
 * Réplica de backend/app/ai/tag_parser.py (normalize_official_id) — mantener sincronizadas.
 * Se usa para validar formularios y para buscar en la caché offline sin conexión.
 */

const CONFUSABLES: Record<string, string> = {
  O: '0', Q: '0', D: '0', U: '0',
  I: '1', L: '1', '|': '1', '!': '1', T: '1',
  Z: '2', S: '5', G: '6', B: '8',
};
const SEPARATORS = new Set([' ', '\t', '-', '.', '_', '·', ':', '/', '\n', '\r']);
const OFFICIAL_DIGITS = 12;
const SPAIN_NUMERIC = '724';

function toDigits(s: string): string | null {
  let out = '';
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (CONFUSABLES[ch]) out += CONFUSABLES[ch];
    else return null;
  }
  return out;
}

export function compact(raw: string): string {
  let s = '';
  for (const ch of raw.toUpperCase()) if (!SEPARATORS.has(ch)) s += ch;
  return s;
}

/** Devuelve "ES" + 12 dígitos o null. */
export function normalizeOfficialId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = compact(raw);
  if (s.startsWith('ES')) {
    const d = toDigits(s.slice(2));
    return d !== null && d.length === OFFICIAL_DIGITS ? `ES${d}` : null;
  }
  const d = toDigits(s);
  if (d === null) return null;
  if (d.length === 15 && d.startsWith(SPAIN_NUMERIC)) return `ES${d.slice(3)}`;
  if (d.length === OFFICIAL_DIGITS) return `ES${d}`;
  return null;
}

/** "ES040812345678" → "ES 0408 1234 5678" */
export function formatOfficialId(norm: string | null | undefined): string {
  if (!norm) return '';
  const n = normalizeOfficialId(norm);
  if (!n) return norm;
  const d = n.slice(2);
  return `ES ${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8)}`;
}

/** Número de manejo: los 4 últimos dígitos del oficial (los impresos en grande). */
export function managementNumber(norm: string | null | undefined): string | null {
  const n = normalizeOfficialId(norm ?? '');
  return n ? n.slice(-4) : null;
}
