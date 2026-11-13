// «Тренировка сейчас»: чистые функции — старт, прошлый результат, таймер отдыха, запись подходов в общий журнал.
import type { WorkoutSet } from '../hevy/hevy';
import type { ActiveExercise, ActiveWorkout, PlanDay, PlanExercise } from './types';

/** Локальное время в формате журнала: YYYY-MM-DDTHH:mm. */
export function localStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface LastResult {
  date: string;
  sets: Array<{ weightKg: number | null; reps: number | null }>;
}

/** Рабочие подходы упражнения с последней тренировки, где оно было (раньше момента `before`). */
export function lastResult(history: WorkoutSet[], exercise: string, before: string): LastResult | null {
  let latest = '';
  for (const s of history) if (s.exercise === exercise && s.setType !== 'warmup' && s.start < before && s.start > latest) latest = s.start;
  if (!latest) return null;
  const sets = history
    .filter((s) => s.exercise === exercise && s.start === latest && s.setType !== 'warmup')
    .sort((a, b) => a.occurrence - b.occurrence || a.setIndex - b.setIndex)
    .map((s) => ({ weightKg: s.weightKg, reps: s.reps }));
  return { date: latest.slice(0, 10), sets };
}

export function toActiveExercise(e: PlanExercise, history: WorkoutSet[], before: string): ActiveExercise {
  const last = lastResult(history, e.name, before);
  return {
    name: e.name,
    repsMin: e.repsMin,
    repsMax: e.repsMax,
    restSec: e.restSec,
    // вес подставляется из прошлого раза, повторы пользователь вводит по факту
    sets: Array.from({ length: e.sets }, (_, i) => ({ weightKg: last?.sets[Math.min(i, last.sets.length - 1)]?.weightKg ?? null, reps: null, done: false })),
  };
}

export function startWorkout(opts: { title: string; day?: PlanDay; programId?: number; dayIndex?: number; history: WorkoutSet[]; now?: Date }): ActiveWorkout {
  const start = localStamp(opts.now);
  return {
    start,
    title: opts.title,
    programId: opts.programId,
    dayIndex: opts.dayIndex,
    exercises: (opts.day?.exercises ?? []).map((e) => toActiveExercise(e, opts.history, start)),
    restEndsAt: null,
    restTotalSec: null,
  };
}

/** Остаток отдыха в секундах. Считается от времени окончания: iOS замораживает страницу в фоне, тики терялись бы. */
export function restRemaining(endsAt: number | null, nowMs: number): number {
  if (endsAt === null) return 0;
  return Math.max(0, Math.ceil((endsAt - nowMs) / 1000));
}

export const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export function doneCount(w: ActiveWorkout): number {
  return w.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
}

/**
 * Отмеченные подходы → строки общего журнала (та же таблица и тот же ключ, что у импорта:
 * время начала | упражнение | № вхождения | № подхода), поэтому вся аналитика работает без изменений.
 */
export function toWorkoutSets(w: ActiveWorkout, end: string = localStamp()): WorkoutSet[] {
  const rows: WorkoutSet[] = [];
  const occ = new Map<string, number>();
  for (const e of w.exercises) {
    const done = e.sets.filter((s) => s.done && s.reps !== null && s.reps > 0);
    if (!done.length) continue;
    const occurrence = occ.get(e.name) ?? 0;
    occ.set(e.name, occurrence + 1);
    done.forEach((s, i) =>
      rows.push({
        key: `${w.start}|${e.name}|${occurrence}|${i}`,
        start: w.start,
        end,
        title: w.title,
        exercise: e.name,
        occurrence,
        setIndex: i,
        setType: 'normal',
        weightKg: s.weightKg,
        reps: s.reps,
        distanceKm: null,
        durationSec: null,
        rpe: null,
        notes: '',
        supersetId: '',
      }),
    );
  }
  return rows;
}
