// Прогноз тела через N месяцев: сухая масса растёт к натуральному потолку с замедлением,
// жир идёт к цели темпом сушки, обхваты пересчитываются. Это МОДЕЛЬ (эвристика), а не обещание:
// реальная скорость набора у тренированных сильно индивидуальна.
import type { MeasureField } from '../data/db';
import type { ButtResult } from './body';
import { LEAN_GAIN_KG_PER_YEAR, FAT_LOSS_PCT_PER_WEEK } from './levels.config';

export type Sex = 'male' | 'female';

export interface ForecastBase {
  sex: Sex;
  heightCm: number;
  weight: number;
  bodyFat: number;
  values: Partial<Record<MeasureField, number>>;
  trainingYears: number;
  goalBodyFat: number;
  cutRatePct: number;
  /** натуральный потенциал по Casey Butt при целевом жире (только мужчины, нужны запястье и лодыжка) */
  butt?: ButtResult | null;
  /**
   * 'aesthetic' (по умолчанию) — «фитнес-модель»: FFMI ≈ 23 (жен. ≈ 19,5), жир ≈ 9–10 % (жен. ≈ 19 %),
   * акцент на верх тела и V-силуэт, ноги и шея растут умеренно, талия ≈ 0,43 × рост.
   * 'max' — максимальная масса у натурального потолка (Casey Butt / FFMI 25): культуристский тип.
   */
  style?: 'aesthetic' | 'max';
}

export interface ForecastPoint {
  months: number;
  lbm: number;
  bodyFat: number;
  weight: number;
  normFfmi: number;
  /** доля пройденного пути к натуральному потолку сухой массы, 0–1 */
  toCeiling: number;
  values: Partial<Record<MeasureField, number>>;
}

const normFfmi = (lbm: number, hCm: number) => lbm / (hCm / 100) ** 2 + 6.1 * (1.8 - hCm / 100);

/** Потолок сухой массы: Casey Butt (если есть), иначе нормализованный FFMI 25 (муж.) / 21 (жен.). */
export function lbmCeiling(b: ForecastBase): number {
  const h = b.heightCm / 100;
  const fromFfmi = (f: number) => (f - 6.1 * (1.8 - h)) * h * h;
  if ((b.style ?? 'aesthetic') === 'aesthetic') return fromFfmi(b.sex === 'male' ? 23 : 19.5);
  if (b.sex === 'male' && b.butt) return b.butt.maxLbmKg;
  return fromFfmi(b.sex === 'male' ? 25 : 21);
}

/** Целевой % жира стиля: эстетика — сухо (видный пресс), но не соревновательная форма. */
export const styleBodyFat = (b: ForecastBase) =>
  (b.style ?? 'aesthetic') === 'aesthetic' ? Math.min(b.goalBodyFat, b.sex === 'male' ? 10 : 19) : b.goalBodyFat;

/** Скорость набора сухой массы, кг/год (середина диапазона эвристики; у женщин вдвое меньше). */
export function leanRatePerYear(years: number, sex: Sex): number {
  const r = years >= 4 ? LEAN_GAIN_KG_PER_YEAR.advanced : years >= 1.5 ? LEAN_GAIN_KG_PER_YEAR.intermediate : LEAN_GAIN_KG_PER_YEAR.novice;
  const mid = (r[0] + r[1]) / 2;
  return sex === 'female' ? mid / 2 : mid;
}

const MUSCLE_FIELDS: MeasureField[] = ['neck', 'shoulders', 'chest', 'bicepsFlexed', 'bicepsRelaxed', 'tricepsFlexed', 'forearm', 'thigh', 'calf'];
const BUTT_MAP: Partial<Record<MeasureField, keyof ButtResult>> = { neck: 'neck', chest: 'chest', bicepsFlexed: 'bicepsFlexed', forearm: 'forearm', thigh: 'thigh', calf: 'calf' };

export function forecastAt(b: ForecastBase, months: number | 'ceiling'): ForecastPoint {
  const lbm0 = b.weight * (1 - b.bodyFat / 100);
  const lbmMax = Math.max(lbm0, lbmCeiling(b));
  const gap0 = lbmMax - lbm0;
  const rate = leanRatePerYear(b.trainingYears, b.sex);
  const t = months === 'ceiling' ? Infinity : Math.max(0, months);
  // Экспоненциальное приближение к потолку: в начале скорость = rate, у потолка → 0
  const lbm = gap0 <= 0.01 ? lbm0 : t === Infinity ? lbmMax : lbmMax - gap0 * Math.exp(-(rate * t) / 12 / gap0);
  const toCeiling = gap0 <= 0.01 ? 1 : (lbm - lbm0) / gap0;

  // Жир: к цели темпом сушки (середина 0.5–1 %/нед), ниже цели не опускаем
  const goal = Math.min(b.bodyFat, styleBodyFat(b));
  const ratePct = (b.cutRatePct || (FAT_LOSS_PCT_PER_WEEK[0] + FAT_LOSS_PCT_PER_WEEK[1]) / 2) / 100;
  const fat0 = b.weight - lbm0;
  const fatGoal = (lbm0 / (1 - goal / 100)) * (goal / 100);
  const weeks = t === Infinity ? Infinity : t * 4.345;
  // за неделю уходит ~ratePct веса; считаем приближённо по жировой массе
  const fat = Math.max(fatGoal, fat0 - (weeks === Infinity ? Infinity : weeks * ratePct * b.weight));
  const fatKg = Number.isFinite(fat) ? fat : fatGoal;
  const weight = lbm + fatKg * (lbm / lbm0); // при наборе сухой массы немного жира набирается пропорционально
  const bodyFat = ((weight - lbm) / weight) * 100;

  // Обхваты: мышечные ∝ √(сухая масса) (окружность растёт как корень из массы при той же длине),
  // минус подкожный жир (~0,4 % обхвата на 1 % жира). Если есть потенциал Butt — тянемся к нему.
  const v = b.values;
  const aesthetic = (b.style ?? 'aesthetic') === 'aesthetic';
  const growth = Math.sqrt(lbm / lbm0);
  const fatAdj = 1 - 0.004 * (b.bodyFat - bodyFat);
  const fatLost = fat0 - fatKg * (lbm / lbm0);
  const r10 = (x: number) => Math.round(x * 10) / 10;
  const out: Partial<Record<MeasureField, number>> = { ...v, weight };
  const UPPER: MeasureField[] = ['shoulders', 'chest', 'bicepsFlexed', 'bicepsRelaxed', 'tricepsFlexed', 'forearm'];
  for (const f of MUSCLE_FIELDS) {
    const cur = v[f];
    if (!cur) continue;
    // эстетика: верх растёт быстрее (приоритет в программе), ноги и шея — вдвое медленнее
    const g = aesthetic ? (UPPER.includes(f) ? growth ** 1.25 : growth ** 0.5) : growth;
    let next = cur * g * fatAdj;
    const bk = BUTT_MAP[f];
    if (!aesthetic && b.sex === 'male' && b.butt && bk) {
      const pot = b.butt[bk] as number;
      if (pot > cur) next = Math.max(next, cur + (pot - cur) * toCeiling);
    }
    out[f] = r10(next);
  }
  // Талия: эстетика — к ≈ 0,43 × рост (≈ 1,1 см на кг сброшенного жира); максимум — 0,9 см/кг, не уже 0,42 × рост
  if (v.waist) out.waist = r10(Math.max((aesthetic ? 0.43 : 0.42) * b.heightCm, v.waist - fatLost * (aesthetic ? 1.1 : 0.9)));
  if (aesthetic) {
    // V-силуэт: плечи тянутся к 1,6 × талия (жен. 1,4) по мере набора
    if (v.shoulders && out.waist) {
      const ideal = (b.sex === 'male' ? 1.6 : 1.4) * out.waist;
      if (ideal > (out.shoulders ?? 0)) out.shoulders = r10((out.shoulders ?? v.shoulders) + (ideal - (out.shoulders ?? v.shoulders)) * toCeiling);
    }
    if (v.hips) out.hips = r10(v.hips * fatAdj);
  } else {
    // плечи тянутся за грудью при наличии потенциала (Butt не даёт плечи)
    if (v.shoulders && v.chest && out.chest) out.shoulders = r10(Math.max(out.shoulders ?? 0, v.shoulders * (out.chest / v.chest)));
    if (v.hips) out.hips = r10(v.hips * fatAdj * (1 + 0.3 * (growth - 1)));
  }
  if (b.values.bodyFatInput !== undefined) out.bodyFatInput = Math.round(bodyFat * 10) / 10;
  return { months: t === Infinity ? Infinity : t, lbm, bodyFat, weight, normFfmi: normFfmi(lbm, b.heightCm), toCeiling, values: out };
}

/** Сколько месяцев до доли потолка p (0–1). */
export function monthsToShare(b: ForecastBase, p: number): number | null {
  const lbm0 = b.weight * (1 - b.bodyFat / 100);
  const gap0 = lbmCeiling(b) - lbm0;
  if (gap0 <= 0.01) return 0;
  if (p >= 1) return null;
  const rate = leanRatePerYear(b.trainingYears, b.sex);
  return (-Math.log(1 - p) * gap0 * 12) / rate;
}
