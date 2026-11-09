// Сводный балл и уровень прокачки.
import {
  COMPONENT_WEIGHTS,
  NORMALIZE,
  STRENGTH_STANDARDS,
  LEVELS,
  LEAN_GAIN_KG_PER_YEAR,
  FAT_LOSS_PCT_PER_WEEK,
  type Component,
  type Lift,
  type Gate,
} from './levels.config';

export interface LevelInput {
  normFfmi?: number | null;
  bodyFat?: number | null;
  shoulderWaist?: number | null;
  reevesPct?: number | null;
  /** 1ПМ / вес тела по упражнениям */
  liftRatios?: Partial<Record<Lift, number>>;
  /** для конкретных советов */
  heightCm?: number;
  weightKg?: number;
  waistCm?: number;
  shouldersCm?: number;
  trainingYears?: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lin = (x: number, [a, b]: readonly [number, number]) => clamp01((x - a) / (b - a)) * 100;

export function strengthScore(ratios?: Partial<Record<Lift, number>>): number | null {
  if (!ratios) return null;
  const vals = (Object.keys(STRENGTH_STANDARDS) as Lift[])
    .filter((l) => ratios[l] !== undefined && ratios[l]! > 0)
    .map((l) => lin(ratios[l]!, STRENGTH_STANDARDS[l]));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function componentScores(i: LevelInput): Partial<Record<Component, number>> {
  const s: Partial<Record<Component, number>> = {};
  if (i.normFfmi != null) s.ffmi = lin(i.normFfmi, NORMALIZE.ffmi);
  if (i.bodyFat != null) {
    let v = lin(i.bodyFat, NORMALIZE.bodyFat);
    if (i.bodyFat < 6) v = Math.max(0, 100 - (6 - i.bodyFat) * 15); // экстремально низкий жир не поощряем
    s.bodyFat = v;
  }
  if (i.shoulderWaist != null) s.shoulderWaist = lin(i.shoulderWaist, NORMALIZE.shoulderWaist);
  if (i.reevesPct != null) s.reeves = lin(i.reevesPct, NORMALIZE.reeves);
  const st = strengthScore(i.liftRatios);
  if (st != null) s.strength = st;
  return s;
}

function gateFailures(g: Gate | undefined, i: LevelInput, st: number | null): string[] {
  if (!g) return [];
  const f: string[] = [];
  if (g.ffmiMin !== undefined && !(i.normFfmi != null && i.normFfmi >= g.ffmiMin)) f.push('ffmi');
  if (g.bodyFatMax !== undefined && !(i.bodyFat != null && i.bodyFat <= g.bodyFatMax)) f.push('bodyFatMax');
  if (g.bodyFatMin !== undefined && !(i.bodyFat != null && i.bodyFat >= g.bodyFatMin)) f.push('bodyFatMin');
  if (g.shoulderWaistMin !== undefined && !(i.shoulderWaist != null && i.shoulderWaist >= g.shoulderWaistMin)) f.push('shoulderWaist');
  if (g.reevesMin !== undefined && !(i.reevesPct != null && i.reevesPct >= g.reevesMin)) f.push('reeves');
  if (g.strengthScoreMin !== undefined && !(st != null && st >= g.strengthScoreMin)) f.push('strength');
  return f;
}

export interface Requirement {
  text: string;
  /** оценка срока, текстом; null если не оценивается */
  eta: string | null;
}

export interface LevelResult {
  score: number;
  /** доля веса компонентов, по которым есть данные (0–1) */
  coverage: number;
  components: Partial<Record<Component, number>>;
  missing: Component[];
  levelIndex: number;
  level: string;
  next: string | null;
  requirements: Requirement[];
  /** компонент, сильнее всего тянущий балл вниз (потеря баллов × вес) */
  weakest: Component | null;
}

export function computeLevel(i: LevelInput): LevelResult {
  const comps = componentScores(i);
  let wsum = 0;
  let total = 0;
  const missing: Component[] = [];
  for (const k of Object.keys(COMPONENT_WEIGHTS) as Component[]) {
    const v = comps[k];
    if (v === undefined) {
      missing.push(k);
      continue;
    }
    wsum += COMPONENT_WEIGHTS[k];
    total += v * COMPONENT_WEIGHTS[k];
  }
  const score = wsum > 0 ? total / wsum : 0;
  const st = comps.strength ?? null;

  let levelIndex = 0;
  for (let k = LEVELS.length - 1; k >= 0; k--) {
    if (score >= LEVELS[k].minScore && gateFailures(LEVELS[k].gate, i, st).length === 0) {
      levelIndex = k;
      break;
    }
  }
  let weakest: Component | null = null;
  let worstLoss = -1;
  for (const k of Object.keys(comps) as Component[]) {
    const loss = (100 - comps[k]!) * COMPONENT_WEIGHTS[k];
    if (loss > worstLoss) {
      worstLoss = loss;
      weakest = k;
    }
  }
  const nextDef = LEVELS[levelIndex + 1];
  return {
    score,
    coverage: wsum,
    components: comps,
    missing,
    levelIndex,
    level: LEVELS[levelIndex].name,
    next: nextDef?.name ?? null,
    requirements: nextDef ? requirementsFor(levelIndex + 1, i, score, st) : [],
    weakest,
  };
}

const fmt = (x: number, d = 1) => x.toFixed(d).replace('.', ',');

function leanRate(years?: number): [number, number] {
  if (years === undefined || years >= 4) return LEAN_GAIN_KG_PER_YEAR.advanced;
  if (years >= 1.5) return LEAN_GAIN_KG_PER_YEAR.intermediate;
  return LEAN_GAIN_KG_PER_YEAR.novice;
}

function monthsRange(amount: number, [lo, hi]: [number, number], perYear = true): string {
  const toMonths = (rate: number) => (perYear ? (amount / rate) * 12 : amount / rate);
  const a = Math.ceil(toMonths(hi));
  const b = Math.ceil(toMonths(lo));
  return a === b ? `≈ ${a} мес.` : `≈ ${a}–${b} мес.`;
}

export function requirementsFor(target: number, i: LevelInput, score: number, st: number | null): Requirement[] {
  const def = LEVELS[target];
  const g = def.gate ?? {};
  const out: Requirement[] = [];
  const h = i.heightCm ? i.heightCm / 100 : null;
  if (g.ffmiMin !== undefined && (i.normFfmi == null || i.normFfmi < g.ffmiMin)) {
    if (i.normFfmi == null || !h) out.push({ text: `Нужен FFMI ≥ ${fmt(g.ffmiMin)}: введите вес, рост, шею и талию`, eta: null });
    else {
      const kg = (g.ffmiMin - i.normFfmi) * h * h;
      out.push({
        text: `FFMI ${fmt(i.normFfmi)} → ${fmt(g.ffmiMin)}: +${fmt(kg)} кг сухой массы`,
        eta: `${monthsRange(kg, leanRate(i.trainingYears))} (эвристика, высокая неопределённость)`,
      });
    }
  }
  if (g.bodyFatMax !== undefined && (i.bodyFat == null || i.bodyFat > g.bodyFatMax)) {
    if (i.bodyFat == null || !i.weightKg) out.push({ text: `Нужен жир ≤ ${g.bodyFatMax} %`, eta: null });
    else {
      // сколько жира сбросить, сохраняя LBM: W' = LBM / (1 − bf'/100)
      const lbm = i.weightKg * (1 - i.bodyFat / 100);
      const w2 = lbm / (1 - g.bodyFatMax / 100);
      const kg = i.weightKg - w2;
      const weeksFast = Math.log(w2 / i.weightKg) / Math.log(1 - FAT_LOSS_PCT_PER_WEEK[1] / 100);
      const weeksSlow = Math.log(w2 / i.weightKg) / Math.log(1 - FAT_LOSS_PCT_PER_WEEK[0] / 100);
      out.push({
        text: `Жир ${fmt(i.bodyFat)} % → ${g.bodyFatMax} %: −${fmt(kg)} кг при сохранении мышц (вес ≈ ${fmt(w2)} кг)`,
        eta: `≈ ${Math.ceil(weeksFast)}–${Math.ceil(weeksSlow)} нед. при 0,5–1 %/нед`,
      });
    }
  }
  if (g.bodyFatMin !== undefined && i.bodyFat != null && i.bodyFat < g.bodyFatMin)
    out.push({ text: `Жир не ниже ${g.bodyFatMin} % — слишком низкий жир не входит в «идеал»`, eta: null });
  if (g.shoulderWaistMin !== undefined && (i.shoulderWaist == null || i.shoulderWaist < g.shoulderWaistMin)) {
    if (i.waistCm && i.shouldersCm) {
      const waistNeed = i.waistCm - i.shouldersCm / g.shoulderWaistMin;
      const shNeed = g.shoulderWaistMin * i.waistCm - i.shouldersCm;
      out.push({
        text: `Плечи/талия ${fmt(i.shoulderWaist ?? 0, 2)} → ${fmt(g.shoulderWaistMin, 2)}: талия −${fmt(waistNeed)} см или плечи +${fmt(shNeed)} см`,
        eta: null,
      });
    } else out.push({ text: `Нужны обхваты плеч и талии (цель плечи/талия ≥ ${g.shoulderWaistMin})`, eta: null });
  }
  if (g.reevesMin !== undefined && (i.reevesPct == null || i.reevesPct < g.reevesMin))
    out.push({ text: `Пропорции Ривза ${i.reevesPct != null ? fmt(i.reevesPct, 0) : '—'} % → ${g.reevesMin} % (см. «Отстающие зоны»)`, eta: null });
  if (g.strengthScoreMin !== undefined && (st == null || st < g.strengthScoreMin)) {
    const r = i.liftRatios ?? {};
    const parts: string[] = [];
    for (const l of Object.keys(STRENGTH_STANDARDS) as Lift[]) {
      const [nov, elite] = STRENGTH_STANDARDS[l];
      const need = nov + ((elite - nov) * g.strengthScoreMin) / 100;
      const have = r[l];
      if (have === undefined || have < need) {
        const name = { bench: 'жим', squat: 'присед', deadlift: 'тяга' }[l];
        const kg = i.weightKg && have !== undefined ? ` (+${fmt((need - have) * i.weightKg, 0)} кг)` : '';
        parts.push(`${name} ${have !== undefined ? fmt(have, 2) : '—'}× → ${fmt(need, 2)}×${kg}`);
      }
    }
    if (parts.length) out.push({ text: `Сила: ${parts.join(', ')}`, eta: null });
  }
  if (score < def.minScore) out.push({ text: `Сводный балл ${fmt(score, 0)} → ${def.minScore}`, eta: null });
  return out;
}
