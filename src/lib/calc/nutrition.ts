// Питание и энергобаланс.
import type { Sex } from './body';
import { ema, lastDays, linearSlope, addDays, type Point } from './trend';

/** Mifflin–St Jeor (1990): 10·кг + 6.25·см − 5·возраст + 5 (муж.) / −161 (жен.). */
export function mifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

/** Katch–McArdle: 370 + 21.6·LBM (кг). */
export const katchMcArdle = (lbmKg: number) => 370 + 21.6 * lbmKg;

/** ≈7700 ккал на 1 кг изменения массы тела — грубое приближение (смесь жира, воды, гликогена). */
export const KCAL_PER_KG = 7700;

export interface DayIntake {
  date: string;
  kcal: number;
}

export interface AdaptiveTdee {
  tdee: number;
  avgIntake: number;
  /** кг/неделю по тренду (EMA) */
  trendKgPerWeek: number;
  days: number;
  loggedDays: number;
}

/**
 * Адаптивный TDEE: средние калории − (наклон тренда веса, кг/день) · 7700.
 * Нужны ≥ 14 дней окна, ≥ 10 дней с записанной едой и ≥ 4 взвешивания.
 */
export function adaptiveTdee(weights: Point[], intake: DayIntake[], windowDays = 21): AdaptiveTdee | null {
  if (!weights.length) return null;
  const w = lastDays(weights, windowDays);
  if (w.length < 4) return null;
  const end = w[w.length - 1].date;
  const start = addDays(end, -(windowDays - 1));
  const days = intake.filter((d) => d.date >= start && d.date <= end && d.kcal > 0);
  if (days.length < 10) return null;
  const span = (Date.parse(end) - Date.parse(w[0].date)) / 86_400_000;
  if (span < 13) return null;
  // Наклон — линейная регрессия по сырым взвешиваниям окна (EMA запаздывает и занижает наклон).
  const fit = linearSlope(w);
  if (!fit) return null;
  const avgIntake = days.reduce((s, d) => s + d.kcal, 0) / days.length;
  return {
    tdee: avgIntake - fit.slope * KCAL_PER_KG,
    avgIntake,
    trendKgPerWeek: fit.slope * 7,
    days: windowDays,
    loggedDays: days.length,
  };
}

/** Темп сушки: 0.5–1 % массы в неделю (Helms et al., 2014). Возвращает дневной дефицит, ккал. */
export function cutDeficit(weightKg: number, pctPerWeek: number): number {
  return (weightKg * (pctPerWeek / 100) * KCAL_PER_KG) / 7;
}

export interface ProteinTarget {
  min: number;
  max: number;
  basis: string;
}
/**
 * Белок: 1.6–2.2 г/кг (Morton et al., 2018); на дефиците — 2.3–3.1 г/кг безжировой массы
 * (Helms et al., 2014, систематический обзор).
 */
export function proteinTarget(weightKg: number, lbmKg: number | null, cutting: boolean): ProteinTarget {
  if (cutting && lbmKg) return { min: 2.3 * lbmKg, max: 3.1 * lbmKg, basis: '2.3–3.1 г/кг безжировой массы (сушка)' };
  return { min: 1.6 * weightKg, max: 2.2 * weightKg, basis: '1.6–2.2 г/кг массы тела' };
}

/** Прогноз даты достижения целевого веса по фактическому тренду (наклон за 21–28 дней). */
export function forecastGoalDate(weights: Point[], goalKg: number, windowDays = 28): { date: string | null; kgPerWeek: number } | null {
  const recent = lastDays(weights, windowDays);
  const fit = linearSlope(recent);
  if (!fit || recent.length < 3) return null;
  // текущий уровень — по EMA (сглаживает дневные колебания воды), наклон — по регрессии
  const last = { date: recent[recent.length - 1].date, value: ema(weights).at(-1)!.value };
  const kgPerWeek = fit.slope * 7;
  const diff = goalKg - last.value;
  if (Math.abs(diff) < 0.05) return { date: last.date, kgPerWeek };
  if (fit.slope === 0 || Math.sign(diff) !== Math.sign(fit.slope)) return { date: null, kgPerWeek };
  const daysLeft = Math.ceil(diff / fit.slope);
  if (daysLeft > 3650) return { date: null, kgPerWeek };
  return { date: addDays(last.date, daysLeft), kgPerWeek };
}

/** Белок на 100 ₽. */
export const proteinPer100Rub = (proteinG: number, priceRub: number) => (priceRub > 0 ? (proteinG / priceRub) * 100 : null);
