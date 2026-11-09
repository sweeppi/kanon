// Состав тела и пропорции. Все функции чистые; единицы — см, кг, %.
// Источники — в SOURCES.md. Эвристики помечены отдельно.

export type Sex = 'male' | 'female';

const finite = (x: number) => Number.isFinite(x);

/**
 * % жира по формуле ВМС США (Hodgdon & Beckett, 1984), метрический вариант, см.
 * Мужчины: 495 / (1.0324 − 0.19077·log10(талия − шея) + 0.15456·log10(рост)) − 450
 * Женщины: 495 / (1.29579 − 0.35004·log10(талия + таз − шея) + 0.22100·log10(рост)) − 450
 */
export function navyBodyFat(sex: Sex, heightCm: number, neckCm: number, waistCm: number, hipsCm?: number): number | null {
  if (sex === 'male') {
    const d = waistCm - neckCm;
    if (!(d > 0) || !(heightCm > 0)) return null;
    const bf = 495 / (1.0324 - 0.19077 * Math.log10(d) + 0.15456 * Math.log10(heightCm)) - 450;
    return finite(bf) ? bf : null;
  }
  if (hipsCm === undefined) return null;
  const d = waistCm + hipsCm - neckCm;
  if (!(d > 0) || !(heightCm > 0)) return null;
  const bf = 495 / (1.29579 - 0.35004 * Math.log10(d) + 0.221 * Math.log10(heightCm)) - 450;
  return finite(bf) ? bf : null;
}

/** Безжировая масса, кг. */
export const leanMass = (weightKg: number, bodyFatPct: number) => weightKg * (1 - bodyFatPct / 100);

/** FFMI = LBM / рост², рост в метрах. */
export const ffmi = (lbmKg: number, heightCm: number) => lbmKg / (heightCm / 100) ** 2;

/** Нормализованный FFMI (Kouri et al., 1995): FFMI + 6.1·(1.8 − рост_м). */
export const normalizedFfmi = (lbmKg: number, heightCm: number) =>
  ffmi(lbmKg, heightCm) + 6.1 * (1.8 - heightCm / 100);

/** Отношение талии к росту; порог риска 0.5 (Ashwell et al., 2012). */
export const waistToHeight = (waistCm: number, heightCm: number) => waistCm / heightCm;

/** Отношение обхвата плеч к талии (V-образность), ориентир ≈ 1.618 — эстетическая эвристика. */
export const shoulderToWaist = (shouldersCm: number, waistCm: number) => shouldersCm / waistCm;

export const GOLDEN = 1.618;

// ---------------- Стив Ривз (эвристика, не исследование) ----------------
// Reeves S., Little J. «Building the Classic Physique — The Natural Way», 1995.
// Коэффициенты по вторичным источникам (Iron Man, Muscle & Strength): книга построчно не сверена.
export const REEVES = {
  armPerWrist: 2.52, // бицепс в напряжении = 252 % запястья
  calfPerAnkle: 1.92, // голень = 192 % лодыжки
  chestPerHips: 1.48, // грудь = 148 % таза
  waistPerHips: 0.86, // талия = 86 % таза
  thighPerKnee: 1.75, // бедро = 175 % колена
} as const;

export interface ReevesInput {
  wrist?: number;
  ankle?: number;
  knee?: number;
  hips?: number;
}
export interface ReevesIdeal {
  bicepsFlexed?: number;
  calf?: number;
  neck?: number;
  chest?: number;
  waist?: number;
  thigh?: number;
}

export function reevesIdeal(m: ReevesInput): ReevesIdeal {
  const out: ReevesIdeal = {};
  if (m.wrist) out.bicepsFlexed = m.wrist * REEVES.armPerWrist;
  if (m.ankle) out.calf = m.ankle * REEVES.calfPerAnkle;
  // «шея = бицепс = голень»: берём среднее двух костных оценок, если есть обе
  const parts = [out.bicepsFlexed, out.calf].filter((v): v is number => v !== undefined);
  if (parts.length) out.neck = parts.reduce((a, b) => a + b, 0) / parts.length;
  if (m.hips) {
    out.chest = m.hips * REEVES.chestPerHips;
    out.waist = m.hips * REEVES.waistPerHips;
  }
  if (m.knee) out.thigh = m.knee * REEVES.thighPerKnee;
  return out;
}

export interface PartStatus {
  key: string;
  current: number;
  target: number;
  /** % выполнения: для «больше — лучше» current/target; для талии — target/current. */
  pct: number;
  /** Отставание, см (>0 — не хватает; для талии — лишнее). */
  gapCm: number;
}

/** Сравнение текущих обхватов с целями Ривза. Талия — «меньше лучше». */
export function reevesStatus(current: Record<string, number | undefined>, ideal: ReevesIdeal): PartStatus[] {
  const out: PartStatus[] = [];
  for (const [key, target] of Object.entries(ideal)) {
    const cur = current[key];
    if (target === undefined || cur === undefined || !(cur > 0)) continue;
    if (key === 'waist') {
      out.push({ key, current: cur, target, pct: Math.min(100, (target / cur) * 100), gapCm: cur - target });
    } else {
      out.push({ key, current: cur, target, pct: (cur / target) * 100, gapCm: target - cur });
    }
  }
  return out.sort((a, b) => a.pct - b.pct);
}

/** Средний % соответствия Ривзу (каждая часть ограничена 100 %). */
export function reevesScore(status: PartStatus[]): number | null {
  if (!status.length) return null;
  return status.reduce((s, p) => s + Math.min(100, p.pct), 0) / status.length;
}

// ---------------- Casey Butt (эвристика, не исследование) ----------------
// Butt C. «Your Muscular Potential», 4-е изд. Коэффициенты взяты из реализации калькулятора
// bonytobeastly.com (ссылается на 4-е издание); сайт автора weightrainer.net был недоступен,
// книга не сверена. Проверка: рост 74″, запястье 6.75″, 10 % жира → бицепс ≈ 16″ (пример с той же страницы).
const IN = 2.54;
export interface ButtResult {
  maxLbmKg: number;
  maxWeightKg: number;
  neck: number;
  chest: number;
  bicepsFlexed: number;
  forearm: number;
  thigh: number;
  calf: number;
}
export function caseyButt(heightCm: number, wristCm: number, ankleCm: number, bodyFatPct = 10): ButtResult | null {
  if (!(heightCm > 0 && wristCm > 0 && ankleCm > 0)) return null;
  const H = heightCm / IN;
  const W = wristCm / IN;
  const A = ankleCm / IN;
  const bf = bodyFatPct;
  const lbmLb = H * (W / 7.2546 + A / 5.9772) * (bf / 450 + 1);
  const weightLb = (lbmLb / (100 - bf)) * 100;
  const LB = 0.45359237;
  return {
    maxLbmKg: lbmLb * LB,
    maxWeightKg: weightLb * LB,
    neck: 2.2574 * W * (bf / 340 + 1) * IN,
    chest: 6.3138 * W * (bf / 340 + 1) * IN,
    bicepsFlexed: 2.3008 * W * (bf / 265 + 1) * IN,
    forearm: 1.8514 * W * (bf / 340 + 1) * IN,
    thigh: 2.6785 * A * (bf / 190 + 1) * IN,
    calf: 1.778 * A * (bf / 210 + 1) * IN,
  };
}
