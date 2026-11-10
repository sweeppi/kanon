// Движок советов: правила из knowledge.json + контекст, посчитанный из данных пользователя.
import KB from './knowledge.json';

export type Evidence = 'meta-analysis' | 'systematic-review' | 'rct' | 'observational' | 'review' | 'consensus';
export const EVIDENCE_RU: Record<Evidence, string> = {
  'meta-analysis': 'Метаанализ',
  'systematic-review': 'Систематический обзор',
  rct: 'РКИ',
  observational: 'Наблюдательное',
  review: 'Обзор (мнение экспертов)',
  consensus: 'Консенсус',
};
export const EVIDENCE_RANK: Record<Evidence, number> = {
  'meta-analysis': 5,
  'systematic-review': 4,
  rct: 4,
  observational: 2,
  review: 1,
  consensus: 1,
};

export interface Source {
  pmid: string;
  doi: string;
  authors: string;
  year: number;
  title: string;
  journal: string;
  type: string;
}

export interface Condition {
  type: string;
  [k: string]: unknown;
}

export interface Rule {
  id: string;
  kind: 'research';
  claim: string;
  condition: Condition;
  recommendation: string;
  sources: string[];
  evidence: Evidence;
  uncertain?: boolean;
}
export interface Heuristic {
  id: string;
  claim: string;
  condition: Condition;
  recommendation: string;
  note: string;
}

export const knowledge = KB as unknown as {
  version: number;
  verifiedAt: string;
  sources: Record<string, Source>;
  rules: Rule[];
  heuristics: Heuristic[];
};

/** Всё, что движок знает о пользователе. Любое поле может отсутствовать — тогда правило не срабатывает. */
export interface AdviceContext {
  /** среднее число рабочих подходов в неделю на мышцу (последние 2 полные недели) */
  weeklySets?: Record<string, number>;
  /** среднее число дней в неделю, когда мышца тренировалась */
  weeklyFrequency?: Record<string, number>;
  /** изменение тренда веса, % массы в неделю (отрицательное — снижение) */
  weightRatePctPerWeek?: number;
  weightKg?: number;
  cutting?: boolean;
  proteinAvg?: number;
  proteinTargetMin?: number;
  proteinMealsAvg?: number;
  fiberAvg?: number;
  plateauWeeks?: number;
  e1rmDrops?: Array<{ exercise: string; pct: number }>;
  e1rmStagnant?: Array<{ exercise: string; weeks: number }>;
  waistToHeight?: number;
  heightCm?: number;
  hyperlordosis?: boolean;
  backFlagLabel?: string;
  flaggedExercises?: Array<{ flag: string; label: string; exercises: string[] }>;
  pushPull?: { push: number; pull: number; kyphosis: boolean };
  axialExercises?: string[];
  weighInsPerWeek?: number;
  normFfmi?: number;
  reevesLagging?: Array<{ name: string; pct: number }>;
  shoulderWaist?: number;
  daysSinceBackup?: number | null;
}

export interface Advice {
  id: string;
  kind: 'research' | 'heuristic';
  claim: string;
  text: string;
  sources: Source[];
  evidence?: Evidence;
  uncertain?: boolean;
  note?: string;
  priority: number;
}

const r1 = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');
const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));

const MUSCLE_RU_SHORT: Record<string, string> = {
  chest: 'грудь', back: 'спина', traps: 'трапеции', shoulders: 'дельты', biceps: 'бицепс', triceps: 'трицепс',
  forearms: 'предплечья', quads: 'квадрицепс', hamstrings: 'бицепс бедра', glutes: 'ягодицы', calves: 'икры', abs: 'пресс', neck: 'шея',
};
/** Основные группы, для которых проверяем объём (шею и предплечья не требуем). */
const MAIN_MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves'];

type Match = { vars: Record<string, string | number>; priority: number } | null;

export function evaluateCondition(c: Condition, ctx: AdviceContext): Match {
  switch (c.type) {
    case 'weeklySetsBelow': {
      if (!ctx.weeklySets) return null;
      const low = MAIN_MUSCLES.filter((m) => (ctx.weeklySets![m] ?? 0) < (c.min as number));
      if (!low.length) return null;
      const avg = low.reduce((s, m) => s + (ctx.weeklySets![m] ?? 0), 0) / low.length;
      return { vars: { muscles: low.map((m) => MUSCLE_RU_SHORT[m]).join(', '), value: r1(avg) }, priority: 3 };
    }
    case 'weeklySetsAbove': {
      if (!ctx.weeklySets) return null;
      const hi = Object.entries(ctx.weeklySets).filter(([, v]) => v > (c.max as number));
      if (!hi.length) return null;
      return { vars: { muscles: hi.map(([m]) => MUSCLE_RU_SHORT[m] ?? m).join(', '), value: hi.map(([, v]) => r1(v)).join(' / ') }, priority: 2 };
    }
    case 'frequencyBelow': {
      if (!ctx.weeklyFrequency) return null;
      const low = MAIN_MUSCLES.filter((m) => ctx.weeklyFrequency![m] !== undefined && ctx.weeklyFrequency![m] < (c.min as number) && ctx.weeklyFrequency![m] > 0);
      if (!low.length) return null;
      return { vars: { muscles: low.map((m) => MUSCLE_RU_SHORT[m]).join(', ') }, priority: 2 };
    }
    case 'lossRateAbove': {
      const r = ctx.weightRatePctPerWeek;
      if (r === undefined || -r <= (c.pctPerWeek as number)) return null;
      const extra = ctx.weightKg ? Math.round(((-r - 0.7) / 100) * ctx.weightKg * 1100) : 200; // 7700/7 ≈ 1100
      return { vars: { value: r1(-r), kcal: Math.max(100, Math.round(extra / 50) * 50) }, priority: 5 };
    }
    case 'gainRateAbove': {
      const r = ctx.weightRatePctPerWeek;
      if (r === undefined || r <= (c.pctPerWeek as number) || ctx.cutting) return null;
      return { vars: { value: r1(r) }, priority: 3 };
    }
    case 'proteinBelowTarget': {
      if (ctx.proteinAvg === undefined || ctx.proteinTargetMin === undefined) return null;
      if (ctx.proteinAvg >= ctx.proteinTargetMin) return null;
      return {
        vars: { value: Math.round(ctx.proteinAvg), target: Math.round(ctx.proteinTargetMin), gap: Math.round(ctx.proteinTargetMin - ctx.proteinAvg) },
        priority: 4,
      };
    }
    case 'proteinMealsBelow': {
      if (ctx.proteinMealsAvg === undefined || ctx.proteinMealsAvg >= (c.min as number)) return null;
      const perMeal = ctx.weightKg ? Math.round(ctx.weightKg * 0.4) : 30;
      return { vars: { value: r1(ctx.proteinMealsAvg), perMeal }, priority: 1 };
    }
    case 'plateauWeeks': {
      if (!ctx.cutting || ctx.plateauWeeks === undefined || ctx.plateauWeeks < (c.weeks as number)) return null;
      return { vars: { value: ctx.plateauWeeks }, priority: 4 };
    }
    case 'e1rmDrop': {
      const d = ctx.e1rmDrops?.filter((x) => x.pct >= (c.pct as number)).sort((a, b) => b.pct - a.pct)[0];
      if (!d) return null;
      return { vars: { exercise: d.exercise, value: r1(d.pct) }, priority: 4 };
    }
    case 'e1rmStagnantWeeks': {
      const d = ctx.e1rmStagnant?.filter((x) => x.weeks >= (c.weeks as number)).sort((a, b) => b.weeks - a.weeks)[0];
      if (!d) return null;
      return { vars: { exercise: d.exercise, value: d.weeks }, priority: 1 };
    }
    case 'waistToHeightAbove': {
      if (ctx.waistToHeight === undefined || ctx.waistToHeight < (c.value as number)) return null;
      return { vars: { value: ctx.waistToHeight.toFixed(2).replace('.', ','), target: ctx.heightCm ? Math.round(ctx.heightCm * 0.5) : '—' }, priority: 3 };
    }
    case 'fiberBelow': {
      if (ctx.fiberAvg === undefined || ctx.fiberAvg >= (c.g as number)) return null;
      return { vars: { value: Math.round(ctx.fiberAvg) }, priority: 1 };
    }
    case 'axialWithLordosis': {
      if (!ctx.hyperlordosis || !ctx.axialExercises?.length) return null;
      return { vars: { value: ctx.axialExercises.slice(0, 4).join(', '), flag: ctx.backFlagLabel ?? 'спина' }, priority: 5 };
    }
    case 'weighInsPerWeekBelow': {
      if (ctx.weighInsPerWeek === undefined || ctx.weighInsPerWeek >= (c.min as number)) return null;
      return { vars: { value: r1(ctx.weighInsPerWeek) }, priority: 2 };
    }
    case 'ffmiAbove': {
      if (ctx.normFfmi === undefined || ctx.normFfmi <= (c.value as number)) return null;
      return { vars: { value: r1(ctx.normFfmi) }, priority: 2 };
    }
    case 'reevesLagging': {
      const lag = ctx.reevesLagging?.filter((x) => x.pct < (c.pct as number));
      if (!lag?.length) return null;
      return { vars: { value: lag.map((x) => `${x.name} ${Math.round(x.pct)} %`).join(', ') }, priority: 2 };
    }
    case 'shoulderWaistBelow': {
      if (ctx.shoulderWaist === undefined || ctx.shoulderWaist >= (c.value as number)) return null;
      return { vars: { value: ctx.shoulderWaist.toFixed(2).replace('.', ',') }, priority: 2 };
    }
    case 'healthFlagExercises': {
      const f = ctx.flaggedExercises?.filter((x) => x.exercises.length);
      if (!f?.length) return null;
      return { vars: { value: f.map((x) => `${x.label}: ${x.exercises.slice(0, 3).join(', ')}`).join('; ') }, priority: 4 };
    }
    case 'pushPullRatio': {
      const pp = ctx.pushPull;
      if (!pp || pp.push <= pp.pull * (c.ratio as number)) return null;
      return { vars: { push: pp.push, pull: pp.pull, extra: pp.kyphosis ? ' При сутулости это особенно важно.' : '' }, priority: pp.kyphosis ? 4 : 2 };
    }
    case 'backupOlderThan': {
      if (ctx.daysSinceBackup === undefined) return null;
      if (ctx.daysSinceBackup !== null && ctx.daysSinceBackup < (c.days as number)) return null;
      return { vars: { value: ctx.daysSinceBackup === null ? 'ни разу' : `${Math.floor(ctx.daysSinceBackup)} дн. назад` }, priority: 4 };
    }
    default:
      return null;
  }
}

export function evaluateAdvice(ctx: AdviceContext): Advice[] {
  const out: Advice[] = [];
  for (const r of knowledge.rules) {
    const m = evaluateCondition(r.condition, ctx);
    if (!m) continue;
    out.push({
      id: r.id,
      kind: 'research',
      claim: r.claim,
      text: fill(r.recommendation, m.vars),
      sources: r.sources.map((s) => {
        const src = knowledge.sources[s];
        if (!src) throw new Error(`Нет источника ${s}`);
        return src;
      }),
      evidence: r.evidence,
      uncertain: r.uncertain,
      priority: m.priority * 10 + EVIDENCE_RANK[r.evidence],
    });
  }
  for (const h of knowledge.heuristics) {
    const m = evaluateCondition(h.condition, ctx);
    if (!m) continue;
    out.push({ id: h.id, kind: 'heuristic', claim: h.claim, text: fill(h.recommendation, m.vars), sources: [], note: h.note, priority: m.priority * 10 });
  }
  return out.sort((a, b) => b.priority - a.priority);
}

export const pubmedUrl = (pmid: string) => `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
export const doiUrl = (doi: string) => `https://doi.org/${doi}`;
