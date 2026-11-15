/// <reference types="jest" />
import { formatOfficialId, managementNumber, normalizeOfficialId } from '@/lib/tagParser';

// Mismos casos que backend/tests/test_tag_parser.py para garantizar paridad.
describe('normalizeOfficialId', () => {
  it.each([
    ['ES 0408 1234 5678', 'ES040812345678'],
    ['es-040812345678', 'ES040812345678'],
    ['040812345678', 'ES040812345678'],
    ['724040812345678', 'ES040812345678'],
    ['ES O4O8 l234 S678', 'ES040812345678'],
    ['ES 0408 1234', null],
    ['FR040812345678', null],
    ['', null],
  ] as [string, string | null][])('%s → %s', (raw, expected) => {
    expect(normalizeOfficialId(raw)).toBe(expected);
  });
});

describe('formato', () => {
  it('formatea en bloques legibles', () => {
    expect(formatOfficialId('ES040812345678')).toBe('ES 0408 1234 5678');
  });
  it('devuelve el número de manejo', () => {
    expect(managementNumber('ES040812345678')).toBe('5678');
    expect(managementNumber(null)).toBeNull();
  });
});
