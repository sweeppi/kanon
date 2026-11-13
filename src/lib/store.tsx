// Живые данные из IndexedDB + производные показатели, доступные всем страницам.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb, DEFAULT_SETTINGS, saveSettings, type Settings, type Measurement, type FoodEntry, type FoodTemplate, type ExerciseOverride } from './data/db';
import type { WorkoutSet } from './hevy/hevy';
import { deriveAll, type Derived } from './derive';
import type { ActiveWorkout, Program } from './program/types';
import type { DailyEntry } from './daily';

interface Store {
  ready: boolean;
  settings: Settings;
  ms: Measurement[];
  sets: WorkoutSet[];
  foods: FoodEntry[];
  templates: FoodTemplate[];
  overrides: ExerciseOverride[];
  programs: Program[];
  /** вода по дням: дата → мл */
  water: Map<string, number>;
  /** сон и шаги по дням */
  daily: DailyEntry[];
  /** идущая тренировка или null */
  active: ActiveWorkout | null;
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
  const programs = useLiveQuery(() => db.programs.toArray(), [], undefined);
  const waterRows = useLiveQuery(() => db.water.toArray(), [], undefined);
  const water = useMemo(() => new Map((waterRows ?? []).map((w) => [w.date, w.ml])), [waterRows]);
  const daily = useLiveQuery(() => db.daily.toArray(), [], undefined);
  // null — «загружено, тренировки нет»; undefined — «ещё грузится»
  const activeRow = useLiveQuery(async () => (await db.kv.get('activeWorkout')) ?? null, [], undefined);
  const settings = useMemo<Settings>(() => ({ ...DEFAULT_SETTINGS, ...((settingsRow?.value as Partial<Settings>) ?? {}) }), [settingsRow]);
  const ready = [ms, sets, foods, templates, overrides, programs, waterRows, daily, activeRow].every((x) => x !== undefined);
  const d = useMemo(
    () => deriveAll(ms ?? [], sets ?? [], foods ?? [], settings, overrides ?? [], undefined, daily ?? []),
    [ms, sets, foods, settings, overrides, daily],
  );
  const value: Store = {
    ready,
    settings,
    ms: ms ?? [],
    sets: sets ?? [],
    foods: foods ?? [],
    templates: templates ?? [],
    overrides: overrides ?? [],
    programs: programs ?? [],
    water,
    daily: daily ?? [],
    active: (activeRow?.value as ActiveWorkout | undefined) ?? null,
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
