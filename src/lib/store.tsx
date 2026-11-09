// Живые данные из IndexedDB + производные показатели, доступные всем страницам.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb, DEFAULT_SETTINGS, saveSettings, type Settings, type Measurement, type FoodEntry, type FoodTemplate, type ExerciseOverride } from './data/db';
import type { WorkoutSet } from './hevy/hevy';
import { deriveAll, type Derived } from './derive';

interface Store {
  ready: boolean;
  settings: Settings;
  ms: Measurement[];
  sets: WorkoutSet[];
  foods: FoodEntry[];
  templates: FoodTemplate[];
  overrides: ExerciseOverride[];
  d: Derived;
  setSettings: (p: Partial<Settings>) => Promise<Settings>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const db = getDb();
  const settingsRow = useLiveQuery(() => db.kv.get('settings'), [], undefined);
  const ms = useLiveQuery(() => db.measurements.orderBy('date').toArray(), [], undefined);
  const sets = useLiveQuery(() => db.sets.toArray(), [], undefined);
  const foods = useLiveQuery(() => db.foods.toArray(), [], undefined);
  const templates = useLiveQuery(() => db.templates.toArray(), [], undefined);
  const overrides = useLiveQuery(() => db.exerciseOverrides.toArray(), [], undefined);
  const settings = useMemo<Settings>(() => ({ ...DEFAULT_SETTINGS, ...((settingsRow?.value as Partial<Settings>) ?? {}) }), [settingsRow]);
  const ready = [ms, sets, foods, templates, overrides].every((x) => x !== undefined);
  const d = useMemo(
    () => deriveAll(ms ?? [], sets ?? [], foods ?? [], settings, overrides ?? []),
    [ms, sets, foods, settings, overrides],
  );
  const value: Store = {
    ready,
    settings,
    ms: ms ?? [],
    sets: sets ?? [],
    foods: foods ?? [],
    templates: templates ?? [],
    overrides: overrides ?? [],
    d,
    setSettings: (p) => saveSettings(p),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider отсутствует');
  return s;
}
