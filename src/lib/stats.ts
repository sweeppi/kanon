// Статистика за период (7 / 30 / 90 дней) и сравнение с таким же предыдущим периодом. Чистые функции.
import type { Measurement, FoodEntry } from './data/db';
import type { WorkoutSet } from './hevy/hevy';
import type { DailyEntry } from './daily';
import { addDays } from './calc/trend';

export interface PeriodInput {
  ms: Measurement[];
  sets: WorkoutSet[];
  foods: FoodEntry[];
  daily: DailyEntry[];
  water: Map<string, number>;
}

export interface PeriodMetrics {
  from: string;
  to: string;
  /** средний вес по взвешиваниям периода */
  weightAvg: number | null;
  weighIns: number;
  kcalAvg: number | null;
  proteinAvg: number | null;
  /** дней с записями еды */
  foodDays: number;
  stepsAvg: number | null;
  stepsDays: number;
  sleepAvgMin: number | null;
  sleepNights: number;
  waterAvgMl: number | null;
  workouts: number;
  workingSets: number;
  tonnage: number;
  /** дней с любой записью пользователя: замер, еда или тренировка */
  activeDays: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function metricsFor(inp: PeriodInput, from: string, to: string): PeriodMetrics {
  const inRange = (d: string) => d >= from && d <= to;
  const weights = inp.ms.filter((m) => m.weight && inRange(m.date)).map((m) => m.weight!);
  const byDay = new Map<string, { kcal: number; protein: number }>();
  for (const f of inp.foods) {
    if (!inRange(f.date)) continue;
    const d = byDay.get(f.date) ?? { kcal: 0, protein: 0 };
    d.kcal += f.kcal;
    d.protein += f.protein;
    byDay.set(f.date, d);
  }
  const foodDays = [...byDay.values()].filter((d) => d.kcal > 0);
  const daily = inp.daily.filter((d) => inRange(d.date));
  const steps = daily.filter((d) => d.steps !== undefined).map((d) => d.steps!);
  const sleep = daily.filter((d) => d.sleepMin !== undefined).map((d) => d.sleepMin!);
  const water = [...inp.water.entries()].filter(([d, ml]) => inRange(d) && ml > 0).map(([, ml]) => ml);
  const sets = inp.sets.filter((s) => inRange(s.start.slice(0, 10)));
  const work = sets.filter((s) => s.setType !== 'warmup');
  const active = new Set<string>([...inp.ms.filter((m) => inRange(m.date)).map((m) => m.date), ...byDay.keys(), ...sets.map((s) => s.start.slice(0, 10))]);
  return {
    from,
    to,
    weightAvg: mean(weights),
    weighIns: weights.length,
    kcalAvg: mean(foodDays.map((d) => d.kcal)),
    proteinAvg: mean(foodDays.map((d) => d.protein)),
    foodDays: foodDays.length,
    stepsAvg: mean(steps),
    stepsDays: steps.length,
    sleepAvgMin: mean(sleep),
    sleepNights: sleep.length,
    waterAvgMl: mean(water),
    workouts: new Set(sets.map((s) => s.start)).size,
    workingSets: work.length,
    tonnage: Math.round(work.reduce((a, s) => a + (s.weightKg ?? 0) * (s.reps ?? 0), 0)),
    activeDays: active.size,
  };
}

/** Текущий период заканчивается сегодня и длится `days` дней; предыдущий — такой же длины сразу перед ним. */
export function periodStats(inp: PeriodInput, days: number, now: string): { cur: PeriodMetrics; prev: PeriodMetrics } {
  const from = addDays(now, -(days - 1));
  const prevTo = addDays(from, -1);
  return { cur: metricsFor(inp, from, now), prev: metricsFor(inp, addDays(prevTo, -(days - 1)), prevTo) };
}

/** Самая длинная серия дней подряд среди дат с записями. */
export function longestStreak(dates: Iterable<string>): number {
  const sorted = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Среднее число шагов за последние `days` дней, если есть хотя бы `minDays` дней с данными. */
export function recentStepsAvg(daily: DailyEntry[], now: string, days = 7, minDays = 4): number | null {
  const from = addDays(now, -(days - 1));
  const xs = daily.filter((d) => d.steps !== undefined && d.date >= from && d.date <= now).map((d) => d.steps!);
  return xs.length >= minDays ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}
