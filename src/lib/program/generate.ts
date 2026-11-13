// Генератор программ по правилам. Чистая функция: одинаковые параметры → одинаковая программа.
//
// На что опирается (источники проверены scripts/verify-sources.mjs, ключи — в knowledge.json):
//   • объём: 10+ рабочих подходов на мышцу в неделю дают больший прирост, чем меньше 10 — schoenfeld2017;
//   • частота: каждая мышца минимум 2 раза в неделю — schoenfeld2016;
//   • повторы: для роста мышц диапазон повторов широкий, для максимальной силы нужны тяжёлые веса — schoenfeld2017load;
//   • отдых: 3 минуты между подходами дали больше силы и массы, чем 1 минута — schoenfeld2016rest.
// Эвристики приложения (не исследования): раскладка по дням, выбор конкретных упражнений, верхняя граница 20 подходов,
// число подходов по стажу, оценка длительности тренировки.
import { lookupExercise, MUSCLE_RU, type Muscle } from '../hevy/exercises';
import { flagsForTags, type HealthFlags } from '../health';
import { CATALOG, COMPOUND, GEAR_EQUIPMENT, MAIN_LIFTS, type Slot } from './catalog';
import type { GenParams, PlanDay, PlanExercise, Program } from './types';

export const PROGRAM_SOURCES = ['schoenfeld2017', 'schoenfeld2016', 'schoenfeld2017load', 'schoenfeld2016rest'] as const;
export const VOLUME_MIN = 10;
export const VOLUME_MAX = 20;
/** Мышцы, по которым проверяется недельный объём и частота. */
export const MAJOR: Muscle[] = ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes'];

type DayTpl = { name: string; slots: Slot[] };

const FULL_A: DayTpl = { name: 'Всё тело А', slots: ['squat', 'hPush', 'hPull', 'hamCurl', 'lateral', 'triceps', 'core'] };
const FULL_B: DayTpl = { name: 'Всё тело Б', slots: ['hinge', 'vPush', 'vPull', 'squat2', 'inclinePush', 'biceps', 'calves'] };
const FULL_C: DayTpl = { name: 'Всё тело В', slots: ['squat2', 'inclinePush', 'hPull2', 'hinge2', 'lateral', 'biceps', 'triceps'] };
const UPPER_1: DayTpl = { name: 'Верх 1', slots: ['hPush', 'hPull', 'vPush', 'vPull', 'fly', 'lateral', 'biceps', 'triceps'] };
const UPPER_2: DayTpl = { name: 'Верх 2', slots: ['inclinePush', 'vPull', 'hPull2', 'fly', 'lateral', 'rearDelt', 'biceps', 'triceps'] };
const LOWER_1: DayTpl = { name: 'Низ 1', slots: ['squat', 'hinge', 'legExt', 'hamCurl', 'calves', 'core'] };
const LOWER_2: DayTpl = { name: 'Низ 2', slots: ['squat2', 'hinge2', 'hamCurl', 'legExt', 'calves', 'core'] };
const PUSH_1: DayTpl = { name: 'Жимы 1', slots: ['hPush', 'vPush', 'inclinePush', 'lateral', 'triceps'] };
const PUSH_2: DayTpl = { name: 'Жимы 2', slots: ['inclinePush', 'vPush', 'hPush', 'lateral', 'triceps'] };
const PULL_1: DayTpl = { name: 'Тяги 1', slots: ['vPull', 'hPull', 'hPull2', 'rearDelt', 'biceps'] };
const PULL_2: DayTpl = { name: 'Тяги 2', slots: ['hPull2', 'vPull', 'hPull', 'rearDelt', 'biceps'] };
const LEGS_1: DayTpl = { name: 'Ноги 1', slots: ['squat', 'hinge', 'legExt', 'hamCurl', 'calves', 'core'] };
const LEGS_2: DayTpl = { name: 'Ноги 2', slots: ['squat2', 'hinge2', 'hamCurl', 'legExt', 'calves', 'core'] };

export function splitFor(days: number): DayTpl[] {
  switch (Math.max(2, Math.min(6, Math.round(days)))) {
    case 2:
      return [FULL_A, FULL_B];
    case 3:
      return [FULL_A, FULL_B, FULL_C];
    case 4:
      return [UPPER_1, LOWER_1, UPPER_2, LOWER_2];
    case 5:
      return [UPPER_1, LOWER_1, PUSH_1, PULL_1, LEGS_2];
    default:
      return [PUSH_1, PULL_1, LEGS_1, PUSH_2, PULL_2, LEGS_2];
  }
}

const SLOT_RU: Record<Slot, string> = {
  hPush: 'жим лёжа',
  inclinePush: 'жим под наклоном',
  fly: 'сведения рук',
  vPush: 'жим над головой',
  lateral: 'махи в стороны',
  vPull: 'вертикальная тяга',
  hPull: 'горизонтальная тяга',
  hPull2: 'горизонтальная тяга',
  rearDelt: 'задние дельты',
  squat: 'приседания',
  squat2: 'приседания или жим ногами',
  hinge: 'наклон с весом',
  hinge2: 'ягодичный мост',
  hamCurl: 'сгибания ног',
  legExt: 'разгибания ног',
  calves: 'икры',
  biceps: 'бицепс',
  triceps: 'трицепс',
  core: 'кор',
};

/** Первое упражнение слота, которое доступно по оборудованию и не затрагивает отмеченные ограничения. */
export function pickExercise(slot: Slot, p: Pick<GenParams, 'gear' | 'healthFlags'>, avoid: Set<string> = new Set()): string | null {
  const allowed = GEAR_EQUIPMENT[p.gear];
  const ok = CATALOG[slot].filter((c) => allowed.includes(c.equipment) && flagsForTags(lookupExercise(c.name)?.tags, p.healthFlags).length === 0);
  return (ok.find((c) => !avoid.has(c.name)) ?? ok[0])?.name ?? null;
}

/** Замены для упражнения в готовой программе: другие варианты того же слота с теми же фильтрами. */
export function alternatives(name: string, p: Pick<GenParams, 'gear' | 'healthFlags'>): string[] {
  const allowed = GEAR_EQUIPMENT[p.gear];
  const out = new Set<string>();
  for (const list of Object.values(CATALOG)) {
    if (!list.some((c) => c.name === name)) continue;
    for (const c of list) if (c.name !== name && allowed.includes(c.equipment) && flagsForTags(lookupExercise(c.name)?.tags, p.healthFlags).length === 0) out.add(c.name);
  }
  return [...out];
}

/** Оценка длительности дня в минутах: 40 с на подход + отдых, плюс 5 минут разминки (эвристика). */
export function dayMinutes(day: PlanDay): number {
  const sec = day.exercises.reduce((a, e) => a + e.sets * (40 + e.restSec), 0);
  return Math.round(sec / 60) + 5;
}

/** Недельный объём: основная мышца = 1 подход, вспомогательная = 0,5 — как во всей аналитике приложения. */
export function weeklyVolume(days: PlanDay[]): Partial<Record<Muscle, number>> {
  const v: Partial<Record<Muscle, number>> = {};
  for (const d of days)
    for (const e of d.exercises) {
      const info = lookupExercise(e.name);
      if (!info) continue;
      for (const m of info.primary) v[m] = (v[m] ?? 0) + e.sets;
      for (const m of info.secondary) v[m] = (v[m] ?? 0) + e.sets * 0.5;
    }
  return v;
}

/** Сколько дней в неделю мышца получает прямую нагрузку (как основная). */
export function weeklyFrequency(days: PlanDay[]): Partial<Record<Muscle, number>> {
  const f: Partial<Record<Muscle, number>> = {};
  for (const d of days) {
    const hit = new Set<Muscle>();
    for (const e of d.exercises) for (const m of lookupExercise(e.name)?.primary ?? []) hit.add(m);
    for (const m of hit) f[m] = (f[m] ?? 0) + 1;
  }
  return f;
}

function prescription(slot: Slot, p: GenParams): Omit<PlanExercise, 'name'> {
  const compound = COMPOUND.includes(slot);
  const level = p.trainingYears < 1 ? 0 : p.trainingYears < 3 ? 1 : 2;
  // Подходы: больше стаж — больше подходов. При 2–3 днях мышца встречается реже, поэтому 4 подхода уже со стажа 1 год;
  // при 5–6 днях многосуставные не выше 3, чтобы не уйти за 20 в неделю
  let sets = compound ? ((level === 2 && p.daysPerWeek <= 4) || (level >= 1 && p.daysPerWeek <= 3) ? 4 : 3) : level === 0 ? 2 : 3;
  if (slot === 'core' || slot === 'calves') sets = Math.min(sets, 3);
  let repsMin = compound ? 6 : 10;
  let repsMax = compound ? 10 : 15;
  let restSec = compound ? 150 : 90;
  if (p.goal === 'strength' && MAIN_LIFTS.includes(slot)) {
    repsMin = 3;
    repsMax = 6;
    restSec = 180;
  }
  // Свой вес: нагрузку нельзя добавить блином, поэтому прогресс идёт повторами — диапазон шире
  if (p.gear === 'bodyweight' && compound) {
    repsMin = 8;
    repsMax = 15;
  }
  // Повышенное давление: без околопредельных подходов (совет из ограничений по здоровью)
  if (p.healthFlags.hypertension && repsMin < 8) {
    repsMin = 8;
    repsMax = Math.max(repsMax, 12);
  }
  if (slot === 'core') {
    repsMin = 8;
    repsMax = 12;
    restSec = 60;
  }
  return { sets, repsMin, repsMax, restSec };
}

const MAX_SETS = 5;

export function generateProgram(input: GenParams, now = new Date().toISOString()): Program {
  const p: GenParams = { ...input, daysPerWeek: Math.max(2, Math.min(6, Math.round(input.daysPerWeek))), priority: input.priority.slice(0, 2) };
  const notes: string[] = [];
  const skipped = new Set<string>();
  const usedWeek = new Set<string>();

  const days: PlanDay[] = splitFor(p.daysPerWeek).map((tpl) => {
    const inDay = new Set<string>();
    const exercises: PlanExercise[] = [];
    for (const slot of tpl.slots) {
      // сначала ищем упражнение, которого ещё не было на неделе; в одном дне повторов нет никогда
      const name = pickExercise(slot, p, new Set([...usedWeek, ...inDay])) ?? null;
      if (!name) {
        skipped.add(SLOT_RU[slot]);
        continue;
      }
      if (inDay.has(name)) continue;
      inDay.add(name);
      usedWeek.add(name);
      const rx = prescription(slot, p);
      const primary = lookupExercise(name)?.primary ?? [];
      if (p.priority.some((m) => primary.includes(m))) rx.sets = Math.min(MAX_SETS, rx.sets + 1);
      exercises.push({ name, ...rx });
    }
    return { name: tpl.name, exercises };
  });

  // Уложиться во время: убираем упражнения с конца дня (там изоляция), но не меньше трёх на день
  let trimmed = false;
  for (const d of days) {
    while (dayMinutes(d) > p.minutes && d.exercises.length > 3) {
      d.exercises.pop();
      trimmed = true;
    }
  }

  // Не выше 20 подходов в неделю на мышцу: снимаем по подходу с упражнений, где мышца основная
  for (const m of MAJOR) {
    let guard = 40;
    while ((weeklyVolume(days)[m] ?? 0) > VOLUME_MAX && guard-- > 0) {
      const target = days
        .flatMap((d) => d.exercises)
        .filter((e) => e.sets > 2 && lookupExercise(e.name)?.primary.includes(m))
        .sort((a, b) => b.sets - a.sets)[0];
      if (!target) break;
      target.sets--;
    }
  }

  const vol = weeklyVolume(days);
  const freq = weeklyFrequency(days);
  const low = MAJOR.filter((m) => (vol[m] ?? 0) < VOLUME_MIN);
  const rare = MAJOR.filter((m) => (freq[m] ?? 0) < 2);
  const hasFlags = Object.values(p.healthFlags).some(Boolean);
  if (skipped.size)
    notes.push(
      hasFlags
        ? `Пропущены движения, для которых не нашлось упражнения без отмеченных рисков и под ваше оборудование: ${[...skipped].join(', ')}. Замену стоит обсудить с врачом или тренером.`
        : `Пропущены движения, для которых нет упражнения под выбранное оборудование: ${[...skipped].join(', ')}.`,
    );
  if (trimmed) notes.push(`Чтобы уложиться в ${p.minutes} минут, в конце дней убраны изолирующие упражнения.`);
  if (low.length) notes.push(`Меньше ${VOLUME_MIN} подходов в неделю: ${low.map((m) => MUSCLE_RU[m].toLowerCase()).join(', ')}. Рост будет, но медленнее; добавьте день или время, если хотите больше.`);
  if (rare.length) notes.push(`Реже двух раз в неделю как основная мышца: ${rare.map((m) => MUSCLE_RU[m].toLowerCase()).join(', ')}.`);
  if (p.healthFlags.hypertension) notes.push('Из-за отметки о давлении все подходы — от 8 повторов, без околопредельных весов.');

  const gearRu = { gym: 'зал', dumbbells: 'гантели', bodyweight: 'свой вес' }[p.gear];
  return {
    name: `${p.daysPerWeek} дн. в неделю, ${gearRu}, ${p.goal === 'muscle' ? 'мышцы' : 'сила'}`,
    createdAt: now,
    days,
    nextDay: 0,
    params: p,
    notes,
  };
}

/** Сколько упражнений в программе затрагивают отмеченные ограничения (должно быть 0 — проверяется тестом). */
export function flaggedInProgram(days: PlanDay[], flags: HealthFlags): string[] {
  return days.flatMap((d) => d.exercises).filter((e) => flagsForTags(lookupExercise(e.name)?.tags, flags).length > 0).map((e) => e.name);
}
