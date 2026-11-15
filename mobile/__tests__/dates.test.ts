/// <reference types="jest" />
import { parseDate, toDisplay } from '@/lib/dates';

const NOW = new Date('2026-11-15T12:00:00');

describe('parseDate', () => {
  it('convierte dd/mm/aaaa a ISO', () => {
    expect(parseDate('5/3/2024', NOW)).toBe('2024-03-05');
    expect(parseDate('05-03-2024', NOW)).toBe('2024-03-05');
  });
  it('vacío es null', () => expect(parseDate('  ', NOW)).toBeNull());
  it('rechaza fechas imposibles o futuras', () => {
    expect(parseDate('31/02/2024', NOW)).toBe('invalid');
    expect(parseDate('01/01/2030', NOW)).toBe('invalid');
    expect(parseDate('2024-03-05', NOW)).toBe('invalid');
  });
  it('toDisplay invierte', () => expect(toDisplay('2024-03-05')).toBe('05/03/2024'));
});
