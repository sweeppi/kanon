// Импорт экспорта Hevy: тренировки (workout_data.csv) и замеры (measurements).
import { parseCsv, parseNum } from './csv';
import { parseHevyDate, detectDayOrder } from './dates';

export const LB = 0.45359237;
export const MILE = 1.609344;

export interface WorkoutSet {
  /** Ключ дедупликации: время начала + упражнение + № вхождения упражнения + № подхода. */
  key: string;
  start: string; // YYYY-MM-DDTHH:mm (локальное)
  end: string | null;
  title: string;
  exercise: string;
  occurrence: number;
  setIndex: number;
  setType: string; // normal | warmup | dropset | failure
  weightKg: number | null;
  reps: number | null;
  distanceKm: number | null;
  durationSec: number | null;
  rpe: number | null;
  notes: string;
  supersetId: string;
}

export interface ParseResult<T> {
  rows: T[];
  errors: string[];
  unit: 'kg' | 'lbs' | 'mixed';
}

export class FormatError extends Error {}

const norm = (h: string) => h.trim().toLowerCase().replace(/^"|"$/g, '').replace(/\s+/g, '_');

/** Разбирает CSV тренировок Hevy. Бросает FormatError, если это не тот файл. */
export function parseHevyWorkouts(text: string): ParseResult<WorkoutSet> {
  if (!text || !text.trim()) throw new FormatError('Файл пустой');
  const table = parseCsv(text);
  if (table.length < 1) throw new FormatError('Файл пустой');
  const header = table[0].map(norm);
  const col = (n: string) => header.indexOf(n);
  const required = ['title', 'start_time', 'exercise_title', 'set_index'];
  const miss = required.filter((r) => col(r) < 0);
  const wKg = col('weight_kg');
  const wLb = col('weight_lbs');
  if (miss.length || (wKg < 0 && wLb < 0) || col('reps') < 0)
    throw new FormatError(
      `Это не похоже на экспорт тренировок Hevy: нет колонок ${[...miss, ...(wKg < 0 && wLb < 0 ? ['weight_kg/weight_lbs'] : []), ...(col('reps') < 0 ? ['reps'] : [])].join(', ')}`,
    );
  const dKm = col('distance_km');
  const dMi = col('distance_miles');
  const dates = table.slice(1).map((r) => r[col('start_time')] ?? '');
  const order = detectDayOrder(dates);
  const rows: WorkoutSet[] = [];
  const errors: string[] = [];
  const occ = new Map<string, Map<string, number>>(); // start -> exercise -> occurrence
  const lastExercise = new Map<string, string>(); // start -> последнее упражнение
  const lastIdx = new Map<string, number>(); // start -> последний set_index
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const get = (n: string) => {
      const c = col(n);
      return c >= 0 ? (r[c] ?? '').trim() : '';
    };
    const line = i + 1;
    const startRaw = get('start_time');
    const start = parseHevyDate(startRaw, order);
    const exercise = get('exercise_title');
    const setIndex = parseNum(get('set_index'));
    if (!start || !exercise || setIndex === null) {
      errors.push(`Строка ${line}: не распознаны ${!start ? `дата «${startRaw}»` : !exercise ? 'упражнение' : 'номер подхода'}`);
      continue;
    }
    // № вхождения упражнения в тренировку (если одно упражнение встречается дважды)
    // Новый «блок» упражнения начинается, когда упражнение сменилось или номер подхода не вырос.
    const m = occ.get(start) ?? new Map<string, number>();
    occ.set(start, m);
    const prev = lastExercise.get(start);
    const prevIdx = lastIdx.get(start) ?? -1;
    if (prev !== exercise || setIndex <= prevIdx) m.set(exercise, (m.get(exercise) ?? -1) + 1);
    lastExercise.set(start, exercise);
    lastIdx.set(start, setIndex);
    const occurrence = m.get(exercise)!;
    let weightKg: number | null = null;
    if (wKg >= 0 && get('weight_kg') !== '') weightKg = parseNum(get('weight_kg'));
    else if (wLb >= 0 && get('weight_lbs') !== '') {
      const lb = parseNum(get('weight_lbs'));
      weightKg = lb === null ? null : Math.round(lb * LB * 100) / 100;
    }
    let distanceKm: number | null = null;
    if (dKm >= 0) distanceKm = parseNum(get('distance_km'));
    else if (dMi >= 0) {
      const mi = parseNum(get('distance_miles'));
      distanceKm = mi === null ? null : mi * MILE;
    }
    const reps = parseNum(get('reps'));
    if (weightKg !== null && (weightKg < 0 || weightKg > 1000)) {
      errors.push(`Строка ${line}: подозрительный вес ${weightKg}`);
      continue;
    }
    rows.push({
      key: `${start}|${exercise}|${occurrence}|${setIndex}`,
      start,
      end: parseHevyDate(get('end_time'), order),
      title: get('title'),
      exercise,
      occurrence,
      setIndex,
      setType: (get('set_type') || 'normal').toLowerCase(),
      weightKg,
      reps,
      distanceKm,
      durationSec: parseNum(get('duration_seconds')),
      rpe: parseNum(get('rpe')),
      notes: get('exercise_notes'),
      supersetId: get('superset_id'),
    });
  }
  if (!rows.length && errors.length) throw new FormatError(`Не удалось прочитать ни одной строки. ${errors[0]}`);
  return { rows, errors, unit: wKg >= 0 && wLb >= 0 ? 'mixed' : wKg >= 0 ? 'kg' : 'lbs' };
}

export interface ImportPreview {
  workouts: number;
  newWorkouts: number;
  duplicateWorkouts: number;
  sets: number;
  newSets: number;
  duplicateSets: number;
  warmupSets: number;
}

/** Превью: сколько тренировок/подходов новые, а сколько уже есть в базе (по ключам). */
export function previewImport(rows: WorkoutSet[], existingKeys: Set<string>): ImportPreview {
  const byWorkout = new Map<string, { total: number; dup: number }>();
  let newSets = 0;
  let warmup = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    const w = byWorkout.get(r.start) ?? { total: 0, dup: 0 };
    byWorkout.set(r.start, w);
    w.total++;
    if (existingKeys.has(r.key) || seen.has(r.key)) w.dup++;
    else newSets++;
    seen.add(r.key);
    if (r.setType === 'warmup') warmup++;
  }
  let dupW = 0;
  for (const w of byWorkout.values()) if (w.dup === w.total) dupW++;
  return {
    workouts: byWorkout.size,
    newWorkouts: byWorkout.size - dupW,
    duplicateWorkouts: dupW,
    sets: rows.length,
    newSets,
    duplicateSets: rows.length - newSets,
    warmupSets: warmup,
  };
}

// ---------------- Замеры Hevy ----------------
// Формат экспорта замеров Hevy в документации не описан; распознаём колонки по ключевым словам.
// Пример ожидаемых заголовков: date, weight_kg, fat_percent, neck_cm, shoulder_cm, chest_cm,
// left_bicep_cm, right_bicep_cm, left_forearm_cm, waist_cm, hips_cm, left_thigh_cm, left_calf_cm.

export interface ImportedMeasurement {
  date: string; // YYYY-MM-DD
  values: Record<string, number>;
}

const MEASURE_KEYS: Array<[RegExp, string]> = [
  [/^(body_?)?weight/, 'weight'],
  [/fat/, 'bodyFat'],
  [/neck/, 'neck'],
  [/shoulder/, 'shoulders'],
  [/chest/, 'chest'],
  [/waist/, 'waist'],
  [/abdomen/, 'waist'],
  [/hip/, 'hips'],
  [/forearm/, 'forearm'],
  [/bicep|upper_?arm/, 'bicepsRelaxed'],
  [/thigh/, 'thigh'],
  [/calf/, 'calf'],
];

export function parseHevyMeasurements(text: string): ParseResult<ImportedMeasurement> {
  const table = parseCsv(text);
  if (table.length < 2) throw new FormatError('Файл замеров пустой');
  const header = table[0].map(norm);
  const dateCol = header.findIndex((h) => h === 'date' || h.includes('date') || h === 'дата');
  if (dateCol < 0) throw new FormatError('Нет колонки date — это не файл замеров Hevy');
  const cols: Array<{ idx: number; key: string; factor: number }> = [];
  // Идём по справочнику в порядке приоритета: для каждого ключа берём первую подходящую колонку.
  // Правую сторону пропускаем (берём левую), каждую колонку используем один раз.
  const usedKeys = new Set<string>();
  const usedCols = new Set<number>();
  for (const [re, key] of MEASURE_KEYS) {
    if (usedKeys.has(key)) continue;
    const idx = header.findIndex((h, i) => i !== dateCol && !usedCols.has(i) && !h.startsWith('right_') && re.test(h));
    if (idx < 0) continue;
    const h = header[idx];
    let factor = 1;
    if (/_lbs?$/.test(h)) factor = LB;
    if (/_in(ches)?$/.test(h)) factor = 2.54;
    cols.push({ idx, key, factor });
    usedKeys.add(key);
    usedCols.add(idx);
  }
  if (!cols.length) throw new FormatError('Не нашёл ни одной колонки замеров (weight, waist, chest…)');
  const order = detectDayOrder(table.slice(1).map((r) => r[dateCol] ?? ''));
  const rows: ImportedMeasurement[] = [];
  const errors: string[] = [];
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const d = parseHevyDate(r[dateCol] ?? '', order);
    if (!d) {
      errors.push(`Строка ${i + 1}: дата «${r[dateCol] ?? ''}» не распознана`);
      continue;
    }
    const values: Record<string, number> = {};
    for (const c of cols) {
      const v = parseNum(r[c.idx]);
      if (v !== null && v > 0) values[c.key] = Math.round(v * c.factor * 10) / 10;
    }
    if (Object.keys(values).length) rows.push({ date: d.slice(0, 10), values });
  }
  return { rows, errors, unit: cols.some((c) => c.factor !== 1) ? 'lbs' : 'kg' };
}
