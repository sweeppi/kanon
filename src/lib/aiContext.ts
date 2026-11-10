// Текст «контекст для ИИ»: данные за период + строгая инструкция отвечать по рецензируемым исследованиям.
import type { Measurement, FoodEntry, Settings } from './data/db';
import type { WorkoutSet } from './hevy/hevy';
import type { Derived } from './derive';
import { addDays } from './calc/trend';
import { weeklySetsPerMuscle } from './hevy/training';
import { MUSCLE_RU, PATTERN_RU, type Muscle } from './hevy/exercises';
import { MEASURE_LABELS } from './data/backup';
import { activeFlags } from './health';

const n = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));

export function buildAiContext(p: { days: number; ms: Measurement[]; sets: WorkoutSet[]; foods: FoodEntry[]; settings: Settings; d: Derived }): string {
  const { days, ms, sets, foods, settings: s, d } = p;
  const from = addDays(d.now, -(days - 1));
  const msIn = ms.filter((m) => m.date >= from).sort((a, b) => a.date.localeCompare(b.date));
  const L: string[] = [];
  L.push('ИНСТРУКЦИЯ ДЛЯ ИИ');
  L.push('Отвечай только на основе рецензируемых исследований (метаанализы, РКИ, систематические обзоры). Для каждого утверждения указывай PMID или DOI. Явно помечай неуверенность и случаи, когда данных мало или они перенесены с другой популяции. Не выдумывай ссылки. Не ставь диагнозов; при боли и симптомах советуй врача. Отвечай по-русски, кратко, таблицами.');
  L.push('');
  L.push(`ПРОФИЛЬ: ${s.sex === 'male' ? 'мужчина' : 'женщина'}, ${s.age} лет, рост ${n(d.comp.heightCm, 0)} см, стаж ${s.trainingYears} лет. Цель: ${s.goalWeightKg} кг, жир ${s.goalBodyFat} %, темп ${s.cutRatePct} %/нед.`);
  const flags = activeFlags(s.healthFlags);
  if (flags.length) L.push(`Ограничения по здоровью (самооценка): ${flags.map((f) => f.label).join('; ')}.`);
  L.push(`ПЕРИОД: ${from} — ${d.now} (${days} дн.)`);
  L.push('');
  L.push('СОСТАВ ТЕЛА (последние значения):');
  L.push(`- Вес ${n(d.values.weight)} кг; тренд EMA ${n(d.trend.at(-1)?.value)} кг; темп ${n(d.ratePctPerWeek, 2)} %/нед`);
  L.push(`- Жир ${n(d.comp.bodyFat)} % (${d.comp.bodyFatSource === 'navy' ? 'формула ВМС США' : d.comp.bodyFatSource === 'input' ? 'весы/калипер' : 'нет данных'}); LBM ${n(d.comp.lbm)} кг; FFMI норм. ${n(d.comp.normFfmi)}`);
  L.push(`- Талия/рост ${n(d.comp.whtr, 2)}; плечи/талия ${n(d.comp.sw, 2)}; пропорции Ривза ${n(d.comp.reevesPct, 0)} % (эвристика)`);
  L.push(`- Уровень в приложении: ${d.level.level} (${n(d.level.score, 0)}/100)`);
  if (msIn.length) {
    L.push('');
    L.push('ЗАМЕРЫ ЗА ПЕРИОД (дата: поля, см/кг):');
    for (const m of msIn) {
      const parts = Object.entries(m)
        .filter(([k, v]) => typeof v === 'number' && k !== 'id')
        .map(([k, v]) => `${MEASURE_LABELS[k] ?? k} ${v}`);
      L.push(`- ${m.date}: ${parts.join(', ')}`);
    }
  }
  const setsIn = sets.filter((x) => x.start.slice(0, 10) >= from);
  if (setsIn.length) {
    const weekly = weeklySetsPerMuscle(setsIn);
    L.push('');
    L.push('ТРЕНИРОВКИ: рабочие подходы на мышцу по неделям (основная = 1, вспомогательная = 0.5):');
    for (const [wk, row] of Object.entries(weekly).sort()) {
      L.push(`- неделя с ${wk}: ${Object.entries(row).map(([m, v]) => `${MUSCLE_RU[m as Muscle]} ${v}`).join(', ')}`);
    }
    const pats = Object.values(d.patterns);
    if (pats.length)
      L.push(`Лучший расчётный 1ПМ по паттернам (Epley/Brzycki): ${pats.map((p) => `${PATTERN_RU[p!.pattern]} — ${p!.exercise} ${n(p!.e1rm, 0)} кг (${n(p!.ratio, 2)}× веса)`).join('; ')}`);
    const drops = d.strength.filter((x) => Math.abs(x.dropPct) > 2);
    if (drops.length) L.push(`Динамика 1ПМ (4 нед. против 8 до): ${drops.map((x) => `${x.exercise} ${x.dropPct > 0 ? '−' : '+'}${n(Math.abs(x.dropPct))} %`).join('; ')}`);
  }
  const daysFood = [...d.totals.values()].filter((x) => x.date >= from && x.kcal > 0);
  if (daysFood.length) {
    const avg = (f: (x: (typeof daysFood)[number]) => number) => daysFood.reduce((a, x) => a + f(x), 0) / daysFood.length;
    L.push('');
    L.push(`ПИТАНИЕ: записано ${daysFood.length} дн. Среднее: ${n(avg((x) => x.kcal), 0)} ккал, Б ${n(avg((x) => x.protein), 0)} г, Ж ${n(avg((x) => x.fat), 0)} г, У ${n(avg((x) => x.carbs), 0)} г, клетчатка ${n(avg((x) => x.fiber), 0)} г.`);
    if (d.targets) L.push(`Цели приложения: ${d.targets.kcal} ккал, белок ${d.targets.protein} г; TDEE ${n(d.targets.tdee, 0)} (${d.targets.tdeeSource === 'adaptive' ? 'адаптивный' : 'по формуле'}).`);
  }
  void foods;
  L.push('');
  L.push('ВОПРОС: <впишите свой вопрос>');
  return L.join('\n');
}
