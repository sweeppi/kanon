// Аналитика тренировок: рабочие подходы на мышцу в неделю, тоннаж, рекорды, расчётный 1ПМ.
import type { WorkoutSet } from './hevy';
import { lookupExercise, normalizeName, strengthStandard, type ExerciseInfo, type Muscle, type Pattern } from './exercises';
import { e1rm } from '../calc/strength';
import { toMs, DAY } from '../calc/trend';

export const isWorking = (s: Pick<WorkoutSet, 'setType'>) => s.setType !== 'warmup';

/** Понедельник недели (ISO) для даты YYYY-MM-DD. */
export function weekStart(date: string): string {
  const d = new Date(toMs(date.slice(0, 10)));
  const dow = (d.getUTCDay() + 6) % 7; // 0 = понедельник
  return new Date(d.getTime() - dow * DAY).toISOString().slice(0, 10);
}

export type WeeklyMuscleSets = Record<string, Partial<Record<Muscle, number>>>;

export function weeklySetsPerMuscle(sets: WorkoutSet[], overrides?: Record<string, ExerciseInfo>): WeeklyMuscleSets {
  const out: WeeklyMuscleSets = {};
  for (const s of sets) {
    if (!isWorking(s)) continue;
    const info = lookupExercise(s.exercise, overrides);
    if (!info || info.pattern === 'cardio') continue; // кардио не считаем подходами на мышцу
    const wk = weekStart(s.start);
    const row = (out[wk] ??= {});
    for (const m of info.primary) row[m] = (row[m] ?? 0) + 1;
    for (const m of info.secondary) row[m] = (row[m] ?? 0) + 0.5;
  }
  return out;
}

export function weeklyTonnage(sets: WorkoutSet[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sets) {
    if (!isWorking(s) || !s.weightKg || !s.reps) continue;
    const wk = weekStart(s.start);
    out[wk] = (out[wk] ?? 0) + s.weightKg * s.reps;
  }
  return out;
}

export interface ExercisePR {
  exercise: string;
  bestE1rm: number | null;
  bestE1rmDate: string | null;
  heaviest: number;
  heaviestDate: string;
  sets: number;
}

export function personalRecords(sets: WorkoutSet[]): ExercisePR[] {
  const map = new Map<string, ExercisePR>();
  for (const s of sets) {
    if (!isWorking(s) || !s.weightKg || !s.reps) continue;
    const pr = map.get(s.exercise) ?? { exercise: s.exercise, bestE1rm: null, bestE1rmDate: null, heaviest: 0, heaviestDate: s.start, sets: 0 };
    pr.sets++;
    if (s.weightKg > pr.heaviest) {
      pr.heaviest = s.weightKg;
      pr.heaviestDate = s.start;
    }
    const e = e1rm(s.weightKg, s.reps);
    if (e !== null && (pr.bestE1rm === null || e > pr.bestE1rm)) {
      pr.bestE1rm = e;
      pr.bestE1rmDate = s.start;
    }
    map.set(s.exercise, pr);
  }
  return [...map.values()].sort((a, b) => b.sets - a.sets);
}

/** Лучший расчётный 1ПМ по упражнению в каждой тренировке (для графика). */
export function e1rmSeries(sets: WorkoutSet[], exercise: string): Array<{ date: string; value: number }> {
  const best = new Map<string, number>();
  for (const s of sets) {
    if (s.exercise !== exercise || !isWorking(s) || !s.weightKg || !s.reps) continue;
    const e = e1rm(s.weightKg, s.reps);
    if (e === null) continue;
    const d = s.start.slice(0, 10);
    best.set(d, Math.max(best.get(d) ?? 0, e));
  }
  return [...best.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

export type Sex = 'male' | 'female';
/** Основные паттерны для силового балла (у каждого — лучшее упражнение, включая тренажёры). */
export const STRENGTH_PATTERNS: Pattern[] = ['hPush', 'vPush', 'squat', 'hinge', 'hPull', 'vPull'];

export interface PatternBest {
  pattern: Pattern;
  exercise: string;
  e1rm: number;
  /** 1ПМ / вес тела (для гантелей — вес одной гантели) */
  ratio: number;
  /** [новичок, элита] после поправки на пол */
  std: [number, number];
  score: number;
}

/** Поправка стандартов для женщин (эвристика): верх тела ×0.6, низ ×0.7. */
const sexFactor = (p: Pattern, sex: Sex) => (sex === 'male' ? 1 : p === 'squat' || p === 'hinge' ? 0.7 : 0.6);

/**
 * Лучшее упражнение в каждом паттерне за последние N дней. Подтягивания с отягощением:
 * (вес тела + отягощение) / вес тела, стандарт 1.0 → 1.75. Эвристика — не исследование.
 */
export function patternStrength(
  sets: WorkoutSet[],
  bodyweight: number | undefined,
  sex: Sex = 'male',
  days = 120,
  overrides?: Record<string, ExerciseInfo>,
): Partial<Record<Pattern, PatternBest>> {
  const out: Partial<Record<Pattern, PatternBest>> = {};
  if (!sets.length || !bodyweight) return out;
  const last = Math.max(...sets.map((s) => toMs(s.start.slice(0, 10))));
  for (const s of sets) {
    if (!isWorking(s) || !s.reps || s.reps > 10) continue;
    if (last - toMs(s.start.slice(0, 10)) > days * DAY) continue;
    const info = lookupExercise(s.exercise, overrides);
    if (!info?.pattern || !STRENGTH_PATTERNS.includes(info.pattern)) continue;
    const n = normalizeName(s.exercise);
    const k = sexFactor(info.pattern, sex);
    const isPullUp = info.pattern === 'vPull' && /pull ?up|chin ?up|подтяг/.test(n) && !/assisted|гравитрон|помощ/.test(n);
    let load = s.weightKg ?? 0;
    let adj: [number, number] | null;
    if (isPullUp) {
      load = bodyweight + (s.weightKg ?? 0); // в Hevy вес у подтягиваний — это отягощение
      adj = [1.0, 1 + 0.75 * k];
    } else {
      const std = strengthStandard(s.exercise, info);
      adj = std ? [std[0] * k, std[1] * k] : null;
    }
    if (!adj || !(load > 0)) continue;
    const e = e1rm(load, s.reps);
    if (e === null) continue;
    const ratio = e / bodyweight;
    const score = Math.max(0, Math.min(100, ((ratio - adj[0]) / (adj[1] - adj[0])) * 100));
    const cur = out[info.pattern];
    if (!cur || score > cur.score) out[info.pattern] = { pattern: info.pattern, exercise: s.exercise, e1rm: e, ratio, std: adj, score };
  }
  return out;
}

/** Силовой балл = среднее лучших баллов по присутствующим паттернам. */
export function strengthSummary(p: Partial<Record<Pattern, PatternBest>>): { score: number; patterns: PatternBest[] } | undefined {
  const list = STRENGTH_PATTERNS.map((k) => p[k]).filter((x): x is PatternBest => !!x);
  if (!list.length) return undefined;
  return { score: list.reduce((a, b) => a + b.score, 0) / list.length, patterns: list };
}

/** Группировка подходов в тренировки. */
export function groupWorkouts(sets: WorkoutSet[]) {
  const m = new Map<string, { start: string; title: string; sets: WorkoutSet[] }>();
  for (const s of sets) {
    const w = m.get(s.start) ?? { start: s.start, title: s.title, sets: [] };
    w.sets.push(s);
    m.set(s.start, w);
  }
  return [...m.values()].sort((a, b) => b.start.localeCompare(a.start));
}
