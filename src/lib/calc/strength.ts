// Силовые расчёты. Вес — кг.
import type { Sex } from './body';

/** Epley (1985): w·(1 + reps/30). Только при 1 ≤ reps ≤ 10, иначе null. */
export function epley(weight: number, reps: number): number | null {
  if (!(weight > 0) || !(reps >= 1) || reps > 10) return null;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

/** Brzycki (1993): w·36/(37 − reps). Только при 1 ≤ reps ≤ 10, иначе null. */
export function brzycki(weight: number, reps: number): number | null {
  if (!(weight > 0) || !(reps >= 1) || reps > 10) return null;
  return (weight * 36) / (37 - reps);
}

/** Расчётный 1ПМ = среднее Epley и Brzycki (при reps ≤ 10). */
export function e1rm(weight: number, reps: number): number | null {
  const a = epley(weight, reps);
  const b = brzycki(weight, reps);
  if (a === null || b === null) return null;
  return (a + b) / 2;
}

/**
 * Коэффициент DOTS (OpenPowerlifting / IPF, 2019): total · 500 / (a + b·bw + c·bw² + d·bw³ + e·bw⁴).
 * Вес тела ограничивается 40–210 кг (муж.) и 40–150 кг (жен.).
 */
export function dots(totalKg: number, bodyweightKg: number, sex: Sex): number | null {
  if (!(totalKg > 0 && bodyweightKg > 0)) return null;
  const c =
    sex === 'male'
      ? { a: -307.75076, b: 24.0900756, c: -0.1918759221, d: 0.0007391293, e: -0.000001093, lo: 40, hi: 210 }
      : { a: -57.96288, b: 13.6175032, c: -0.1126655495, d: 0.0005158568, e: -0.0000010706, lo: 40, hi: 150 };
  const bw = Math.min(c.hi, Math.max(c.lo, bodyweightKg));
  const denom = c.a + c.b * bw + c.c * bw ** 2 + c.d * bw ** 3 + c.e * bw ** 4;
  return (totalKg * 500) / denom;
}

export const relativeStrength = (oneRm: number, bodyweight: number) => oneRm / bodyweight;
