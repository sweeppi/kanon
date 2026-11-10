// Локальная база IndexedDB через Dexie. Сервер не нужен: все данные живут только на устройстве.
import Dexie, { type EntityTable } from 'dexie';
import type { WorkoutSet } from '../hevy/hevy';
import type { ExerciseInfo } from '../hevy/exercises';
import type { HealthFlags } from '../health';
import { DEFAULT_ACTIVITY, type ActivityProfile } from '../calc/activity';

export const MEASURE_FIELDS = [
  'weight',
  'bodyFatInput',
  'height',
  'neck',
  'shoulders',
  'chest',
  'waist',
  'hips',
  'thigh',
  'knee',
  'calf',
  'ankle',
  'bicepsFlexed',
  'bicepsRelaxed',
  'tricepsFlexed',
  'forearm',
  'wrist',
] as const;
export type MeasureField = (typeof MEASURE_FIELDS)[number];

export type Measurement = { id?: number; date: string; note?: string } & Partial<Record<MeasureField, number>>;

export interface FoodEntry {
  id?: number;
  date: string;
  name: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  sugar?: number;
  priceRub?: number;
  grams?: number;
  source?: 'manual' | 'template' | 'off' | 'import' | 'copy';
  /** клетчатка/сахар оценены автоматически (не с этикетки) */
  fiberEstimated?: boolean;
  sugarEstimated?: boolean;
}

export interface FoodTemplate {
  id?: number;
  name: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  sugar?: number;
  priceRub?: number;
  grams?: number;
}

export type PhotoAngle = 'front' | 'side' | 'back';
export interface Photo {
  id?: number;
  date: string;
  angle: PhotoAngle;
  mime: string;
  data: ArrayBuffer;
}

export interface ExerciseOverride extends ExerciseInfo {
  title: string;
}

export interface Settings {
  sex: 'male' | 'female';
  age: number;
  heightCm: number;
  goalWeightKg: number;
  goalBodyFat: number;
  cutRatePct: number; // % массы в неделю
  trainingYears: number;
  kcalOverride: number | null;
  proteinOverride: number | null;
  /** 'calculator' — по шагам и тренировкам; 'manual' — свой коэффициент activityFactor */
  activityMode: 'calculator' | 'manual';
  activityFactor: number;
  activity: ActivityProfile;
  healthFlags: HealthFlags;
  theme: 'dark' | 'light' | 'system';
  goalMeasurements: Partial<Record<MeasureField, number>>;
  lastBackupAt: string | null;
  onboarded: boolean;
  remindEveryDays: number;
}

export const DEFAULT_SETTINGS: Settings = {
  sex: 'male',
  age: 25,
  heightCm: 175,
  goalWeightKg: 0, // 0 — цель не задана (заполняется в онбординге)
  goalBodyFat: 12,
  cutRatePct: 0.7,
  trainingYears: 1,
  kcalOverride: null,
  proteinOverride: null,
  activityMode: 'calculator',
  activityFactor: 1.55,
  activity: DEFAULT_ACTIVITY,
  healthFlags: {},
  theme: 'dark',
  goalMeasurements: {},
  lastBackupAt: null,
  onboarded: false,
  remindEveryDays: 7,
};

export interface KV {
  key: string;
  value: unknown;
}

export class KanonDB extends Dexie {
  measurements!: EntityTable<Measurement, 'id'>;
  sets!: EntityTable<WorkoutSet, 'key'>;
  foods!: EntityTable<FoodEntry, 'id'>;
  templates!: EntityTable<FoodTemplate, 'id'>;
  photos!: EntityTable<Photo, 'id'>;
  exerciseOverrides!: EntityTable<ExerciseOverride, 'title'>;
  kv!: EntityTable<KV, 'key'>;

  constructor(name = 'kanon') {
    super(name);
    this.version(1).stores({
      measurements: '++id, date',
      sets: 'key, start, exercise',
      foods: '++id, date',
      templates: '++id, name',
      photos: '++id, date, angle',
      exerciseOverrides: 'title',
      kv: 'key',
    });
  }
}

export const TABLES = ['measurements', 'sets', 'foods', 'templates', 'photos', 'exerciseOverrides', 'kv'] as const;
export type TableName = (typeof TABLES)[number];

let _db: KanonDB | null = null;
export function getDb(): KanonDB {
  if (!_db) _db = new KanonDB();
  return _db;
}
/** Для тестов: подменить базу. */
export function setDb(db: KanonDB) {
  _db = db;
}

export async function loadSettings(db = getDb()): Promise<Settings> {
  const row = await db.kv.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>, db = getDb()): Promise<Settings> {
  const cur = await loadSettings(db);
  const next = { ...cur, ...patch };
  await db.kv.put({ key: 'settings', value: next });
  return next;
}

/** Просим браузер не удалять данные при нехватке места (на iOS работает надёжно только для установленного PWA). */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
