// Аналитика тренировок: рабочие подходы на мышцу в неделю, тоннаж, рекорды, расчётный 1ПМ.
import type { WorkoutSet } from './hevy';
import { lookupExercise, type ExerciseInfo, type Muscle } from './exercises';
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
    if (!info) continue;
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

/** Лучший недавний 1ПМ по ключевым движениям (жим, присед, тяга) за последние N дней. */
export function keyLiftMaxes(sets: WorkoutSet[], days = 120, overrides?: Record<string, ExerciseInfo>): Partial<Record<'bench' | 'squat' | 'deadlift', { value: number; exercise: string }>> {
  if (!sets.length) return {};
  const last = Math.max(...sets.map((s) => toMs(s.start.slice(0, 10))));
  const out: Partial<Record<'bench' | 'squat' | 'deadlift', { value: number; exercise: string }>> = {};
  for (const s of sets) {
    if (!isWorking(s) || !s.weightKg || !s.reps) continue;
    if (last - toMs(s.start.slice(0, 10)) > days * DAY) continue;
    const info = lookupExercise(s.exercise, overrides);
    if (!info?.lift) continue;
    const e = e1rm(s.weightKg, s.reps);
    if (e !== null && e > (out[info.lift]?.value ?? 0)) out[info.lift] = { value: e, exercise: s.exercise };
  }
  return out;
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
