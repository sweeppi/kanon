// Сводный балл и уровень прокачки (с учётом пола).
import {
  COMPONENT_WEIGHTS,
  NORMALIZE,
  LEVELS_BY_SEX,
  LEAN_GAIN_KG_PER_YEAR,
  FAT_LOSS_PCT_PER_WEEK,
  type Component,
  type Gate,
  type Sex,
} from './levels.config';

export interface StrengthPatternInput {
  /** название паттерна по-русски, для подсказок */
  label: string;
  exercise: string;
  ratio: number;
  std: [number, number];
  score: number;
}

export interface LevelInput {
  sex?: Sex;
  normFfmi?: number | null;
  bodyFat?: number | null;
  shoulderWaist?: number | null;
  reevesPct?: number | null;
  /** силовой балл 0–100 и лучшие упражнения по паттернам */
  strength?: { score: number; patterns: StrengthPatternInput[] };
  heightCm?: number;
  weightKg?: number;
  waistCm?: number;
  shouldersCm?: number;
  trainingYears?: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lin = (x: number, [a, b]: readonly [number, number]) => clamp01((x - a) / (b - a)) * 100;

export function componentScores(i: LevelInput): Partial<Record<Component, number>> {
  const N = NORMALIZE[i.sex ?? 'male'];
  const s: Partial<Record<Component, number>> = {};
  if (i.normFfmi != null) s.ffmi = lin(i.normFfmi, N.ffmi);
  if (i.bodyFat != null) {
    let v = lin(i.bodyFat, N.bodyFat);
    if (i.bodyFat < N.bodyFatFloor) v = Math.max(0, 100 - (N.bodyFatFloor - i.bodyFat) * 15); // экстремальная сухость не поощряется
    s.bodyFat = v;
  }
  if (i.shoulderWaist != null) s.shoulderWaist = lin(i.shoulderWaist, N.shoulderWaist);
  if (i.reevesPct != null && N.reeves) s.reeves = lin(i.reevesPct, N.reeves);
  if (i.strength) s.strength = i.strength.score;
  return s;
}

function gateFailures(g: Gate | undefined, i: LevelInput, st: number | null): string[] {
  if (!g) return [];
  const f: string[] = [];
  if (g.ffmiMin !== undefined && !(i.normFfmi != null && i.normFfmi >= g.ffmiMin)) f.push('ffmi');
  if (g.bodyFatMax !== undefined && !(i.bodyFat != null && i.bodyFat <= g.bodyFatMax)) f.push('bodyFatMax');
  if (g.bodyFatMin !== undefined && !(i.bodyFat != null && i.bodyFat >= g.bodyFatMin)) f.push('bodyFatMin');
  if (g.shoulderWaistMin !== undefined && !(i.shoulderWaist != null && i.shoulderWaist >= g.shoulderWaistMin)) f.push('shoulderWaist');
  if (g.reevesMin !== undefined && (i.sex ?? 'male') === 'male' && !(i.reevesPct != null && i.reevesPct >= g.reevesMin)) f.push('reeves');
  if (g.strengthScoreMin !== undefined && !(st != null && st >= g.strengthScoreMin)) f.push('strength');
  return f;
}

export interface Requirement {
  text: string;
  eta: string | null;
}

export interface LevelResult {
  score: number;
  coverage: number;
  components: Partial<Record<Component, number>>;
  missing: Component[];
  levelIndex: number;
  level: string;
  next: string | null;
  requirements: Requirement[];
  weakest: Component | null;
}

/** Компоненты, которые для данного пола вообще применимы. */
export const applicableComponents = (sex: Sex = 'male'): Component[] =>
  (Object.keys(COMPONENT_WEIGHTS) as Component[]).filter((c) => !(c === 'reeves' && NORMALIZE[sex].reeves === null));

export function computeLevel(i: LevelInput): LevelResult {
  const sex = i.sex ?? 'male';
  const LEVELS = LEVELS_BY_SEX[sex];
  const comps = componentScores(i);
  let wsum = 0;
  let total = 0;
  const missing: Component[] = [];
  for (const k of applicableComponents(sex)) {
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

function leanRate(years: number | undefined, sex: Sex): [number, number] {
  const base = years === undefined || years >= 4 ? LEAN_GAIN_KG_PER_YEAR.advanced : years >= 1.5 ? LEAN_GAIN_KG_PER_YEAR.intermediate : LEAN_GAIN_KG_PER_YEAR.novice;
  return sex === 'female' ? [base[0] / 2, base[1] / 2] : base;
}

function monthsRange(amount: number, [lo, hi]: [number, number]): string {
  const a = Math.ceil((amount / hi) * 12);
  const b = Math.ceil((amount / lo) * 12);
  return a === b ? `≈ ${a} мес.` : `≈ ${a}–${b} мес.`;
}

export function requirementsFor(target: number, i: LevelInput, score: number, st: number | null): Requirement[] {
  const sex = i.sex ?? 'male';
  const def = LEVELS_BY_SEX[sex][target];
  const g = def.gate ?? {};
  const out: Requirement[] = [];
  const h = i.heightCm ? i.heightCm / 100 : null;
  if (g.ffmiMin !== undefined && (i.normFfmi == null || i.normFfmi < g.ffmiMin)) {
    if (i.normFfmi == null || !h) out.push({ text: `Нужен FFMI ≥ ${fmt(g.ffmiMin)}: введите вес, рост, шею и талию`, eta: null });
    else {
      const kg = (g.ffmiMin - i.normFfmi) * h * h;
      out.push({
        text: `FFMI ${fmt(i.normFfmi)} → ${fmt(g.ffmiMin)}: +${fmt(kg)} кг сухой массы`,
        eta: `${monthsRange(kg, leanRate(i.trainingYears, sex))} (эвристика, высокая неопределённость)`,
      });
    }
  }
  if (g.bodyFatMax !== undefined && (i.bodyFat == null || i.bodyFat > g.bodyFatMax)) {
    if (i.bodyFat == null || !i.weightKg) out.push({ text: `Нужен жир ≤ ${g.bodyFatMax} %`, eta: null });
    else {
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
  if (g.reevesMin !== undefined && sex === 'male' && (i.reevesPct == null || i.reevesPct < g.reevesMin))
    out.push({ text: `Пропорции Ривза ${i.reevesPct != null ? fmt(i.reevesPct, 0) : '—'} % → ${g.reevesMin} % (см. «Отстающие зоны»)`, eta: null });
  if (g.strengthScoreMin !== undefined && (st == null || st < g.strengthScoreMin)) {
    if (!i.strength) out.push({ text: `Сила: импортируйте тренировки (нужен силовой балл ≥ ${g.strengthScoreMin})`, eta: null });
    else {
      const parts = i.strength.patterns
        .filter((p) => p.score < g.strengthScoreMin!)
        .map((p) => {
          const need = p.std[0] + ((p.std[1] - p.std[0]) * g.strengthScoreMin!) / 100;
          const kg = i.weightKg ? ` (+${fmt((need - p.ratio) * i.weightKg, 0)} кг к 1ПМ)` : '';
          return `${p.label}: ${p.exercise} ${fmt(p.ratio, 2)}× → ${fmt(need, 2)}×${kg}`;
        });
      if (parts.length) out.push({ text: `Сила — ${parts.join('; ')}`, eta: null });
    }
  }
  if (score < def.minScore) out.push({ text: `Сводный балл ${fmt(score, 0)} → ${def.minScore}`, eta: null });
  return out;
}
