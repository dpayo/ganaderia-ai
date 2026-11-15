/// <reference types="jest" />
const store: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    store[k] = v;
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    delete store[k];
  }),
}));
jest.mock('expo-constants', () => ({ expoConfig: { hostUri: '192.168.1.20:8081' } }));

import { api, ApiError, authHeaders, setOnAuthLost, setTokens } from '@/lib/api';

function res(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
    json: async () => body,
  } as Response;
}

describe('cliente API', () => {
  const fetchMock = jest.fn();
  beforeEach(async () => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await setTokens({ access_token: 'A1', refresh_token: 'R1' });
  });

  it('usa la IP del servidor de Expo y añade el token', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { ok: true }));
    await api('/farms', { query: { q: 'ES 04', empty: '' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://192.168.1.20:8000/api/v1/farms?q=ES%2004');
    expect(init.headers.Authorization).toBe('Bearer A1');
  });

  it('renueva el token una vez ante un 401 y repite la petición', async () => {
    fetchMock
      .mockResolvedValueOnce(res(401, { detail: 'Sesión caducada' }))
      .mockResolvedValueOnce(res(200, { access_token: 'A2', refresh_token: 'R2' }))
      .mockResolvedValueOnce(res(200, [1]));
    await expect(api('/farms')).resolves.toEqual([1]);
    expect(authHeaders().Authorization).toBe('Bearer A2');
  });

  it('cierra sesión si el refresh falla', async () => {
    const lost = jest.fn();
    setOnAuthLost(lost);
    fetchMock.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(401)).mockResolvedValue(res(401, { detail: 'x' }));
    await expect(api('/farms')).rejects.toBeInstanceOf(ApiError);
    expect(lost).toHaveBeenCalled();
    setOnAuthLost(null);
  });

  it('traduce errores de validación de FastAPI', async () => {
    fetchMock.mockResolvedValueOnce(
      res(422, { detail: [{ loc: ['body', 'official_id'], msg: 'Value error, Identificador oficial no válido' }] }),
    );
    await expect(api('/x', { method: 'POST', body: {} })).rejects.toThrow('official_id: Identificador oficial no válido');
  });

  it('marca los fallos de red como sin conexión', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    const e = await api('/x').catch((err: unknown) => err);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).isNetwork).toBe(true);
  });
});
