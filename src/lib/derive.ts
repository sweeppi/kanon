// Все производные показатели из сырых данных. Чистая функция — UI только отображает результат.
import type { Measurement, FoodEntry, Settings, MeasureField, ExerciseOverride } from './data/db';
import type { WorkoutSet } from './hevy/hevy';
import {
  navyBodyFat,
  leanMass,
  ffmi,
  normalizedFfmi,
  waistToHeight,
  shoulderToWaist,
  reevesIdeal,
  reevesStatus,
  reevesScore,
  caseyButt,
  type PartStatus,
  type ReevesIdeal,
  type ButtResult,
} from './calc/body';
import { ema, linearSlope, lastDays, daysBetween, addDays, toMs, DAY, type Point } from './calc/trend';
import { activityTdee, type ActivityBreakdown } from './calc/activity';
import { activeFlags, FLAG_BY_KEY, type HealthFlag } from './health';
import { mifflin, katchMcArdle, adaptiveTdee, cutDeficit, proteinTarget, forecastGoalDate, type AdaptiveTdee } from './calc/nutrition';
import { computeLevel, type LevelResult } from './calc/levels';
import { weeklySetsPerMuscle, weeklyTonnage, patternStrength, strengthSummary, weekStart, isWorking, e1rmSeries, type PatternBest } from './hevy/training';
import { lookupExercise, PATTERN_RU, type ExerciseInfo, type Muscle, type Pattern, MUSCLE_ZONE } from './hevy/exercises';
import type { AdviceContext } from './advice/engine';
import type { ZoneName } from './model/schema';

export const today = (now = new Date()) => {
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
};

/** Последнее известное значение каждого поля (замеры вносятся не все сразу). */
export function latestValues(ms: Measurement[], until?: string): { values: Partial<Record<MeasureField, number>>; dates: Partial<Record<MeasureField, string>> } {
  const sorted = [...ms].filter((m) => !until || m.date <= until).sort((a, b) => a.date.localeCompare(b.date));
  const values: Partial<Record<MeasureField, number>> = {};
  const dates: Partial<Record<MeasureField, string>> = {};
  for (const m of sorted)
    for (const [k, v] of Object.entries(m))
      if (typeof v === 'number' && k !== 'id' && Number.isFinite(v)) {
        values[k as MeasureField] = v;
        dates[k as MeasureField] = m.date;
      }
  return { values, dates };
}

export interface Composition {
  heightCm: number;
  weight?: number;
  bodyFat: number | null;
  bodyFatSource: 'input' | 'navy' | null;
  lbm: number | null;
  ffmi: number | null;
  normFfmi: number | null;
  whtr: number | null;
  sw: number | null;
  reevesIdeal: ReevesIdeal;
  reevesStatus: PartStatus[];
  reevesPct: number | null;
  butt: ButtResult | null;
}

export function composition(values: Partial<Record<MeasureField, number>>, s: Settings): Composition {
  const h = values.height ?? s.heightCm;
  const navy = values.neck && values.waist ? navyBodyFat(s.sex, h, values.neck, values.waist, values.hips) : null;
  const bodyFat = values.bodyFatInput ?? navy;
  const lbm = values.weight && bodyFat != null ? leanMass(values.weight, bodyFat) : null;
  // Ривз и Casey Butt — мужские эвристики: для женщин не считаем, чтобы не вводить в заблуждение
  const male = s.sex === 'male';
  const ideal = male ? reevesIdeal({ wrist: values.wrist, ankle: values.ankle, knee: values.knee, hips: values.hips }) : {};
  const st = reevesStatus(
    { bicepsFlexed: values.bicepsFlexed, calf: values.calf, neck: values.neck, chest: values.chest, waist: values.waist, thigh: values.thigh },
    ideal,
  );
  return {
    heightCm: h,
    weight: values.weight,
    bodyFat,
    bodyFatSource: values.bodyFatInput != null ? 'input' : navy != null ? 'navy' : null,
    lbm,
    ffmi: lbm ? ffmi(lbm, h) : null,
    normFfmi: lbm ? normalizedFfmi(lbm, h) : null,
    whtr: values.waist ? waistToHeight(values.waist, h) : null,
    sw: values.shoulders && values.waist ? shoulderToWaist(values.shoulders, values.waist) : null,
    reevesIdeal: ideal,
    reevesStatus: st,
    reevesPct: reevesScore(st),
    butt: male && values.wrist && values.ankle ? caseyButt(h, values.wrist, values.ankle, 10) : null,
  };
}

export interface DayTotals {
  date: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  sugar: number;
  priceRub: number;
  entries: number;
  proteinMeals: number;
}

export function dayTotals(foods: FoodEntry[]): Map<string, DayTotals> {
  const m = new Map<string, DayTotals>();
  for (const f of foods) {
    const d = m.get(f.date) ?? { date: f.date, kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sugar: 0, priceRub: 0, entries: 0, proteinMeals: 0 };
    d.kcal += f.kcal;
    d.protein += f.protein;
    d.fat += f.fat;
    d.carbs += f.carbs;
    d.fiber += f.fiber ?? 0;
    d.sugar += f.sugar ?? 0;
    d.priceRub += f.priceRub ?? 0;
    d.entries++;
    if (f.protein >= 20) d.proteinMeals++;
    m.set(f.date, d);
  }
  return m;
}

export interface Targets {
  bmr: number;
  bmrFormula: 'Katch–McArdle' | 'Mifflin–St Jeor';
  tdee: number;
  tdeeSource: 'adaptive' | 'formula';
  /** разбивка расхода по калькулятору активности (если режим 'calculator') */
  activity: ActivityBreakdown | null;
  /** формульный TDEE (без адаптивного) — для сравнения */
  formulaTdee: number;
  adaptive: AdaptiveTdee | null;
  kcal: number;
  kcalOverridden: boolean;
  protein: number;
  proteinRange: [number, number];
  proteinBasis: string;
  proteinOverridden: boolean;
  fat: number;
  carbs: number;
  cutting: boolean;
}

export function nutritionTargets(c: Composition, s: Settings, weights: Point[], totals: Map<string, DayTotals>): Targets | null {
  const w = c.weight;
  if (!w) return null;
  const bmrFormula = c.lbm ? 'Katch–McArdle' : 'Mifflin–St Jeor';
  const bmr = c.lbm ? katchMcArdle(c.lbm) : mifflin(s.sex, w, c.heightCm, s.age);
  const adaptive = adaptiveTdee(weights, [...totals.values()].map((d) => ({ date: d.date, kcal: d.kcal })), 21);
  const activity = s.activityMode === 'calculator' ? activityTdee(bmr, w, s.activity) : null;
  const formulaTdee = activity ? activity.tdee : bmr * s.activityFactor;
  const tdee = adaptive?.tdee ?? formulaTdee;
  const cutting = s.goalWeightKg > 0 && s.goalWeightKg < w - 0.5;
  const kcalAuto = cutting ? tdee - cutDeficit(w, s.cutRatePct) : tdee;
  const kcal = s.kcalOverride ?? Math.round(kcalAuto / 10) * 10;
  const pt = proteinTarget(w, c.lbm, cutting);
  const protein = s.proteinOverride ?? Math.round((pt.min + pt.max) / 2);
  const fat = Math.round(Math.max(0.6 * w, (kcal * 0.25) / 9));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return {
    bmr,
    bmrFormula,
    tdee,
    tdeeSource: adaptive ? 'adaptive' : 'formula',
    activity,
    formulaTdee,
    adaptive,
    kcal,
    kcalOverridden: s.kcalOverride != null,
    protein,
    proteinRange: [pt.min, pt.max],
    proteinBasis: pt.basis,
    proteinOverridden: s.proteinOverride != null,
    fat,
    carbs,
    cutting,
  };
}

/** Недели подряд (с конца), когда средний вес почти не менялся (< 0.1 % массы). Нужны ≥ 2 взвешивания в неделю. */
export function plateauWeeks(weights: Point[]): number {
  const byWeek = new Map<string, number[]>();
  for (const p of weights) {
    const wk = weekStart(p.date);
    byWeek.set(wk, [...(byWeek.get(wk) ?? []), p.value]);
  }
  const weeks = [...byWeek.entries()].filter(([, v]) => v.length >= 2).sort(([a], [b]) => a.localeCompare(b));
  let n = 0;
  for (let i = weeks.length - 1; i > 0; i--) {
    const [wkA, a] = weeks[i - 1];
    const [wkB, b] = weeks[i];
    if (daysBetween(wkA, wkB) > 7) break;
    const ma = a.reduce((x, y) => x + y, 0) / a.length;
    const mb = b.reduce((x, y) => x + y, 0) / b.length;
    if (Math.abs(mb - ma) < 0.001 * ma) n++;
    else break;
  }
  return n;
}

export interface StrengthTrend {
  exercise: string;
  recent: number;
  previous: number;
  dropPct: number;
  weeksSinceBest: number;
}

/** Падение/застой расчётного 1ПМ: лучшее за 28 дней против лучшего за 29–84 дня до последней тренировки. */
export function strengthTrends(sets: WorkoutSet[], topN = 6): StrengthTrend[] {
  if (!sets.length) return [];
  const counts = new Map<string, number>();
  for (const s of sets) if (isWorking(s) && s.weightKg && s.reps && s.reps <= 10) counts.set(s.exercise, (counts.get(s.exercise) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([e]) => e);
  const lastDate = sets.reduce((m, s) => (s.start > m ? s.start : m), '').slice(0, 10);
  const out: StrengthTrend[] = [];
  for (const ex of top) {
    const series = e1rmSeries(sets, ex);
    const recent = series.filter((p) => daysBetween(p.date, lastDate) <= 28);
    const prev = series.filter((p) => daysBetween(p.date, lastDate) > 28 && daysBetween(p.date, lastDate) <= 84);
    if (!recent.length || !prev.length) continue;
    const r = Math.max(...recent.map((p) => p.value));
    const pv = Math.max(...prev.map((p) => p.value));
    const best = series.reduce((b, p) => (p.value >= b.value ? p : b), series[0]);
    out.push({ exercise: ex, recent: r, previous: pv, dropPct: ((pv - r) / pv) * 100, weeksSinceBest: Math.floor(daysBetween(best.date, lastDate) / 7) });
  }
  return out;
}

/** Средние рабочие подходы и частота на мышцу за 2 последние завершённые недели. */
export function recentWeekly(sets: WorkoutSet[], overrides: Record<string, ExerciseInfo>, now: string) {
  const thisWeek = weekStart(now);
  const w1 = addDays(thisWeek, -7);
  const w2 = addDays(thisWeek, -14);
  const all = weeklySetsPerMuscle(sets, overrides);
  const avg: Record<string, number> = {};
  for (const wk of [w1, w2]) for (const [m, v] of Object.entries(all[wk] ?? {})) avg[m] = (avg[m] ?? 0) + v / 2;
  const freq: Record<string, number> = {};
  const days = new Map<string, Set<string>>();
  for (const s of sets) {
    if (!isWorking(s)) continue;
    const wk = weekStart(s.start);
    if (wk !== w1 && wk !== w2) continue;
    const info = lookupExercise(s.exercise, overrides);
    for (const m of info?.primary ?? []) {
      const set = days.get(m) ?? new Set<string>();
      set.add(s.start.slice(0, 10));
      days.set(m, set);
    }
  }
  for (const [m, d] of days) freq[m] = d.size / 2;
  const hasData = Object.keys(all[w1] ?? {}).length > 0 || Object.keys(all[w2] ?? {}).length > 0;
  return { avg: hasData ? avg : undefined, freq: hasData ? freq : undefined, all };
}

/** Серия дней подряд (до сегодня или вчера) с любой записью: взвешивание, еда или тренировка. */
export function streak(dates: Set<string>, now: string): number {
  let d = dates.has(now) ? now : addDays(now, -1);
  let n = 0;
  while (dates.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export interface WeekCompare {
  label: string;
  thisWeek: number | null;
  lastWeek: number | null;
  unit: string;
  betterWhen: 'up' | 'down' | 'none';
}

export function overrideMap(list: ExerciseOverride[]): Record<string, ExerciseInfo> {
  return Object.fromEntries(list.map((o) => [o.title, o]));
}

export interface Derived {
  now: string;
  values: Partial<Record<MeasureField, number>>;
  valueDates: Partial<Record<MeasureField, string>>;
  comp: Composition;
  weights: Point[];
  trend: Point[];
  ratePctPerWeek: number | null;
  targets: Targets | null;
  forecast: ReturnType<typeof forecastGoalDate>;
  totals: Map<string, DayTotals>;
  level: LevelResult;
  patterns: Partial<Record<Pattern, PatternBest>>;
  strengthSum: ReturnType<typeof strengthSummary>;
  weekly: ReturnType<typeof recentWeekly>;
  zoneStatus: Partial<Record<ZoneName, number>>;
  adviceCtx: AdviceContext;
  streak: number;
  weekCompare: WeekCompare[];
  plateau: number;
  strength: StrengthTrend[];
}

export function deriveAll(
  ms: Measurement[],
  sets: WorkoutSet[],
  foods: FoodEntry[],
  s: Settings,
  overrides: ExerciseOverride[],
  now = today(),
): Derived {
  const { values, dates } = latestValues(ms);
  const comp = composition(values, s);
  const weights: Point[] = ms.filter((m) => m.weight).map((m) => ({ date: m.date, value: m.weight! }));
  const trend = ema(weights);
  const last21 = lastDays(weights, 21);
  const fit = last21.length >= 3 ? linearSlope(last21) : null;
  const curW = trend.at(-1)?.value ?? values.weight;
  const ratePctPerWeek = fit && curW ? ((fit.slope * 7) / curW) * 100 : null;
  const totals = dayTotals(foods);
  const targets = nutritionTargets(comp, s, weights, totals);
  const forecast = s.goalWeightKg > 0 ? forecastGoalDate(weights, s.goalWeightKg) : null;
  const ov = overrideMap(overrides);
  const patterns = patternStrength(sets, values.weight, s.sex, 120, ov);
  const strengthSum = strengthSummary(patterns);

  const level = computeLevel({
    normFfmi: comp.normFfmi,
    bodyFat: comp.bodyFat,
    shoulderWaist: comp.sw,
    reevesPct: comp.reevesPct,
    sex: s.sex,
    strength: strengthSum
      ? { score: strengthSum.score, patterns: strengthSum.patterns.map((p) => ({ label: PATTERN_RU[p.pattern], exercise: p.exercise, ratio: p.ratio, std: p.std, score: p.score })) }
      : undefined,
    heightCm: comp.heightCm,
    weightKg: values.weight,
    waistCm: values.waist,
    shouldersCm: values.shoulders,
    trainingYears: s.trainingYears,
  });

  const weekly = recentWeekly(sets, ov, now);

  // Тепловая карта зон: 0–1 (1 — сильная), по пропорциям Ривза и объёму
  const zoneStatus: Partial<Record<ZoneName, number>> = {};
  const reevesZone: Record<string, ZoneName> = { bicepsFlexed: 'arms', calf: 'calves', neck: 'neck', chest: 'chest', waist: 'waist', thigh: 'thighs' };
  for (const st of comp.reevesStatus) zoneStatus[reevesZone[st.key]] = Math.max(0, Math.min(1, (st.pct - 80) / 20));
  if (comp.sw) zoneStatus.shoulders = Math.max(0, Math.min(1, (comp.sw - 1.3) / (1.618 - 1.3)));
  if (weekly.avg) {
    for (const [m, v] of Object.entries(weekly.avg)) {
      const z = MUSCLE_ZONE[m as Muscle];
      const vol = Math.max(0, Math.min(1, v / 12));
      zoneStatus[z] = zoneStatus[z] === undefined ? vol : (zoneStatus[z]! * 2 + vol) / 3;
    }
  }

  const plateau = plateauWeeks(weights);
  const strength = strengthTrends(sets);
  const recentFoodDays = [...totals.values()].filter((d) => daysBetween(d.date, now) < 7 && daysBetween(d.date, now) >= 0 && d.kcal > 0);
  const avg = (f: (d: DayTotals) => number) => (recentFoodDays.length >= 3 ? recentFoodDays.reduce((a, d) => a + f(d), 0) / recentFoodDays.length : undefined);
  const fourWeeksAgo = addDays(now, -28);
  // Упражнения за 4 недели, попадающие под включённые флаги здоровья
  const recentEx = [...new Set(sets.filter((x) => x.start.slice(0, 10) >= fourWeeksAgo && isWorking(x)).map((x) => x.exercise))];
  const flagged: Array<{ flag: HealthFlag; label: string; exercises: string[] }> = [];
  for (const f of activeFlags(s.healthFlags)) {
    const ex = recentEx.filter((e) => (lookupExercise(e, ov)?.tags ?? []).some((t) => f.tags.includes(t)));
    if (ex.length) flagged.push({ flag: f.key, label: f.label, exercises: ex });
  }
  const BACK_FLAGS: HealthFlag[] = ['hyperlordosis', 'lowBackPain', 'disc', 'scoliosis'];
  const backFlag = BACK_FLAGS.find((k) => s.healthFlags[k]);
  const axial = backFlag ? recentEx.filter((e) => lookupExercise(e, ov)?.tags?.includes('axial')) : [];
  // Баланс жимов и тяг (рабочие подходы за 4 недели)
  let pushSets = 0;
  let pullSets = 0;
  for (const x of sets) {
    if (x.start.slice(0, 10) < fourWeeksAgo || !isWorking(x)) continue;
    const p = lookupExercise(x.exercise, ov)?.pattern;
    if (p === 'hPush' || p === 'vPush') pushSets++;
    if (p === 'hPull' || p === 'vPull') pullSets++;
  }
  const w14 = weights.filter((p) => daysBetween(p.date, now) < 14 && daysBetween(p.date, now) >= 0);
  const reevesNames: Record<string, string> = { bicepsFlexed: 'бицепс', calf: 'голень', neck: 'шея', chest: 'грудь', waist: 'талия', thigh: 'бедро' };

  const adviceCtx: AdviceContext = {
    weeklySets: weekly.avg,
    weeklyFrequency: weekly.freq,
    weightRatePctPerWeek: ratePctPerWeek ?? undefined,
    weightKg: values.weight,
    cutting: targets?.cutting ?? (s.goalWeightKg > 0 && s.goalWeightKg < (values.weight ?? 0)),
    proteinAvg: avg((d) => d.protein),
    proteinTargetMin: targets ? (targets.proteinOverridden ? targets.protein : targets.proteinRange[0]) : undefined,
    proteinMealsAvg: avg((d) => d.proteinMeals),
    fiberAvg: avg((d) => d.fiber),
    plateauWeeks: plateau,
    e1rmDrops: strength.filter((x) => x.dropPct > 0).map((x) => ({ exercise: x.exercise, pct: x.dropPct })),
    e1rmStagnant: strength.map((x) => ({ exercise: x.exercise, weeks: x.weeksSinceBest })),
    waistToHeight: comp.whtr ?? undefined,
    heightCm: comp.heightCm,
    hyperlordosis: !!backFlag,
    backFlagLabel: backFlag ? FLAG_BY_KEY[backFlag].label : undefined,
    axialExercises: axial,
    flaggedExercises: flagged.filter((f) => !(BACK_FLAGS.includes(f.flag) && f.exercises.every((e) => axial.includes(e)))),
    pushPull: pushSets + pullSets >= 12 ? { push: pushSets, pull: pullSets, kyphosis: !!s.healthFlags.kyphosis } : undefined,
    weighInsPerWeek: weights.length ? w14.length / 2 : undefined,
    normFfmi: comp.normFfmi ?? undefined,
    reevesLagging: comp.reevesStatus.map((x) => ({ name: reevesNames[x.key] ?? x.key, pct: x.pct })),
    shoulderWaist: comp.sw ?? undefined,
    daysSinceBackup: ms.length || sets.length || foods.length ? (s.lastBackupAt ? (Date.now() - Date.parse(s.lastBackupAt)) / DAY : null) : undefined,
  };

  // серия дней
  const activity = new Set<string>([...ms.map((m) => m.date), ...foods.map((f) => f.date), ...sets.map((x) => x.start.slice(0, 10))]);

  // сравнение недель
  const thisWk = weekStart(now);
  const lastWk = addDays(thisWk, -7);
  const inWeek = (d: string, wk: string) => weekStart(d) === wk;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const tonnage = weeklyTonnage(sets);
  const setsCount = (wk: string) => {
    const n = sets.filter((x) => isWorking(x) && inWeek(x.start, wk)).length;
    return n || null;
  };
  const foodWeek = (wk: string, f: (d: DayTotals) => number) => mean([...totals.values()].filter((d) => inWeek(d.date, wk) && d.kcal > 0).map(f));
  const weekCompare: WeekCompare[] = [
    { label: 'Средний вес', thisWeek: mean(weights.filter((p) => inWeek(p.date, thisWk)).map((p) => p.value)), lastWeek: mean(weights.filter((p) => inWeek(p.date, lastWk)).map((p) => p.value)), unit: 'кг', betterWhen: s.goalWeightKg > 0 && s.goalWeightKg < (values.weight ?? 0) ? 'down' : 'none' },
    { label: 'Ккал в день', thisWeek: foodWeek(thisWk, (d) => d.kcal), lastWeek: foodWeek(lastWk, (d) => d.kcal), unit: 'ккал', betterWhen: 'none' },
    { label: 'Белок в день', thisWeek: foodWeek(thisWk, (d) => d.protein), lastWeek: foodWeek(lastWk, (d) => d.protein), unit: 'г', betterWhen: 'up' },
    { label: 'Рабочие подходы', thisWeek: setsCount(thisWk), lastWeek: setsCount(lastWk), unit: '', betterWhen: 'up' },
    { label: 'Тоннаж', thisWeek: tonnage[thisWk] ?? null, lastWeek: tonnage[lastWk] ?? null, unit: 'кг', betterWhen: 'up' },
  ];

  return {
    now,
    values,
    valueDates: dates,
    comp,
    weights,
    trend,
    ratePctPerWeek,
    targets,
    forecast,
    totals,
    level,
    patterns,
    strengthSum,
    weekly,
    zoneStatus,
    adviceCtx,
    streak: streak(activity, now),
    weekCompare,
    plateau,
    strength,
  };
}

/** Целевые обхваты для режима «цель»: ручные цели → иначе Ривз → иначе текущее. Талия — по цели жира. */
export function goalMeasurements(d: Derived, s: Settings): Partial<Record<MeasureField, number>> {
  const v = d.values;
  const r = d.comp.reevesIdeal;
  const g: Partial<Record<MeasureField, number>> = { ...v };
  if (r.bicepsFlexed) g.bicepsFlexed = r.bicepsFlexed;
  if (r.calf) g.calf = r.calf;
  if (r.neck) g.neck = r.neck;
  if (r.chest) g.chest = r.chest;
  if (r.thigh) g.thigh = r.thigh;
  if (r.waist) g.waist = r.waist;
  if (v.waist && r.waist && v.shoulders) g.shoulders = Math.max(v.shoulders, r.waist * 1.618);
  if (s.goalWeightKg) g.weight = s.goalWeightKg;
  return { ...g, ...s.goalMeasurements };
}

export const toMsSafe = toMs;
