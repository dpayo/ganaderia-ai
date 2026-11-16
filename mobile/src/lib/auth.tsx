import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { loadTokens, setOnAuthLost, setTokens } from './api';
import { Auth, Farms } from './endpoints';
import { clearCache } from './offline';
import { deleteItem, getItem, setItem } from './storage';
import type { Farm, User } from './types';

const FARM_KEY = 'ganaderia.farm';

interface AuthState {
  ready: boolean;
  user: User | null;
  farms: Farm[];
  farm: Farm | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  selectFarm: (id: string) => Promise<void>;
  reloadFarms: () => Promise<Farm[]>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmId, setFarmId] = useState<string | null>(null);

  const reloadFarms = useCallback(async () => {
    const list = await Farms.list();
    setFarms(list);
    const saved = await getItem(FARM_KEY);
    const chosen = list.find((f) => f.id === saved) ?? list[0] ?? null;
    setFarmId(chosen?.id ?? null);
    return list;
  }, []);

  const bootstrap = useCallback(async () => {
    setUser(await Auth.me());
    await reloadFarms();
  }, [reloadFarms]);

  const reset = useCallback(() => {
    setUser(null);
    setFarms([]);
    setFarmId(null);
  }, []);

  useEffect(() => {
    setOnAuthLost(reset);
    (async () => {
      try {
        if (await loadTokens()) await bootstrap();
      } catch {
        // Sin conexión al arrancar: se mantiene la sesión local y se reintenta al usarla.
      } finally {
        setReady(true);
      }
    })();
    return () => setOnAuthLost(null);
  }, [bootstrap, reset]);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      user,
      farms,
      farm: farms.find((f) => f.id === farmId) ?? null,
      login: async (email, password) => {
        await setTokens(await Auth.login(email.trim(), password));
        await bootstrap();
      },
      register: async (email, password, fullName) => {
        await setTokens(await Auth.register(email.trim(), password, fullName.trim()));
        await bootstrap();
      },
      logout: async () => {
        await setTokens(null);
        await deleteItem(FARM_KEY);
        await clearCache();
        reset();
      },
      selectFarm: async (id) => {
        await setItem(FARM_KEY, id);
        setFarmId(id);
      },
      reloadFarms,
    }),
    [ready, user, farms, farmId, bootstrap, reset, reloadFarms],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fuera de AuthProvider');
  return v;
}

/** Explotación activa; las pantallas bajo (tabs) solo se montan si existe. */
export function useFarm(): Farm {
  const { farm } = useAuth();
  if (!farm) throw new Error('No hay explotación seleccionada');
  return farm;
}
