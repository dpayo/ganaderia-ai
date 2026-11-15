/** dd/mm/aaaa ⇄ aaaa-mm-dd */
export function parseDate(s: string, now: Date = new Date()): string | null | 'invalid' {
  const v = s.trim();
  if (!v) return null;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (!m) return 'invalid';
  const [, d, mo, y] = m;
  const iso = `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  const dt = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(dt.getTime()) || dt.getDate() !== Number(d)) return 'invalid';
  if (dt.getTime() > now.getTime()) return 'invalid';
  return iso;
}
export const toDisplay = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

