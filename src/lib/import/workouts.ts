// Импорт тренировок из любого приложения: Hevy, Strong, FitNotes и произвольный CSV с сопоставлением колонок.
// Форматы Strong/FitNotes взяты из сторонних описаний (официальных спецификаций нет) — поэтому
// сопоставление всегда показывается пользователю и его можно поправить.
import { parseHevyDate, detectDayOrder } from '../hevy/dates';
import { parseHevyWorkouts, LB, MILE, type WorkoutSet } from '../hevy/hevy';
import { cell, num, guessMapping, normHeader, unitFromHeader, missingRequired, type FieldDef, type Mapping, type Table, type ImportResult } from './table';

export type WorkoutSource = 'hevy' | 'strong' | 'fitnotes' | 'generic';
export const SOURCE_RU: Record<WorkoutSource, string> = {
  hevy: 'Hevy',
  strong: 'Strong',
  fitnotes: 'FitNotes',
  generic: 'другое приложение / таблица',
};

export const WORKOUT_FIELDS: FieldDef[] = [
  { key: 'start', label: 'Дата (и время) тренировки', required: true, synonyms: [/^start time$/, /^date$/, /^дата( и время)?$/, /date|дата|day|день|time|время|начало/] },
  { key: 'time', label: 'Время (если отдельной колонкой)', synonyms: [/^time$/, /^время$/] },
  { key: 'title', label: 'Название тренировки', synonyms: [/^title$/, /workout name|^workout$|routine|тренировк|программ/] },
  { key: 'exercise', label: 'Упражнение', required: true, synonyms: [/exercise title|exercise name|^exercise$|^movement$|упражнени|^name$|^название$/] },
  { key: 'setIndex', label: '№ подхода', synonyms: [/set index|set order|^set$|set #|set number|подход|№/] },
  { key: 'setType', label: 'Тип подхода (разминка и т. п.)', synonyms: [/set type|^type$|тип/] },
  { key: 'weight', label: 'Вес', synonyms: [/^weight|вес|load|нагрузк|kg$|кг/] },
  { key: 'unit', label: 'Единица веса (колонка)', synonyms: [/weight unit|^unit$|единиц/] },
  { key: 'reps', label: 'Повторения', required: true, synonyms: [/^reps|repetitions|повтор|раз$/] },
  { key: 'rpe', label: 'RPE', synonyms: [/^rpe$|rir|усили/] },
  { key: 'distance', label: 'Дистанция', synonyms: [/distance|дистанц|km|miles/] },
  { key: 'duration', label: 'Длительность, с', synonyms: [/duration seconds|^seconds$|^time sec|длительн|секунд/] },
  { key: 'notes', label: 'Заметки', synonyms: [/exercise notes|^notes$|заметк|коммент/] },
];

export function detectWorkoutSource(header: string[]): WorkoutSource {
  const H = header.map(normHeader);
  const has = (x: string) => H.includes(x);
  if (has('exercise title') && has('start time') && has('set index')) return 'hevy';
  if (has('exercise name') && has('set order')) return 'strong';
  if (has('exercise') && has('category') && H.some((h) => /^weight \((kgs?|lbs?)\)$/.test(h))) return 'fitnotes';
  return 'generic';
}

export interface WorkoutOptions {
  /** единица веса, если её не видно из файла */
  unit: 'kg' | 'lbs';
}

export interface DetectedWorkouts {
  source: WorkoutSource;
  mapping: Mapping;
  /** единица видна из заголовка/колонки — тогда выбор пользователя не нужен */
  unitKnown: 'kg' | 'lbs' | null;
}

export function detectWorkouts(t: Table): DetectedWorkouts {
  const source = detectWorkoutSource(t.header);
  const mapping = guessMapping(t.header, WORKOUT_FIELDS);
  const unitKnown = mapping.weight >= 0 ? unitFromHeader(t.header[mapping.weight]) : null;
  return { source, mapping, unitKnown };
}

const WARMUP = /^(w|warm ?up|warmup|разминк[\wа-яё]*|р)$/i;
const DROP = /^(d|drop ?set|dropset|дроп[\wа-яё]*)$/i;
const FAIL = /^(f|failure|отказ[\wа-яё]*)$/i;

/** Разбор таблицы по сопоставлению. Hevy разбирается проверенным парсером. */
export function parseWorkoutTable(t: Table, text: string, d: DetectedWorkouts, opt: WorkoutOptions): ImportResult<WorkoutSet> & { warnings: string[] } {
  if (d.source === 'hevy') {
    const r = parseHevyWorkouts(text);
    return { rows: r.rows, errors: r.errors, warnings: [] };
  }
  const m = d.mapping;
  const miss = missingRequired(m, WORKOUT_FIELDS);
  if (miss.length) throw new Error(`Укажите колонки: ${miss.map((f) => f.label).join(', ')}`);
  const order = detectDayOrder(t.rows.map((r) => cell(r, m, 'start')));
  const rows: WorkoutSet[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const counter = new Map<string, number>(); // start|exercise → следующий номер подхода
  const occ = new Map<string, Map<string, number>>();
  const lastEx = new Map<string, string>();
  let defaultTime = false;
  t.rows.forEach((r, i) => {
    const line = i + 2;
    let raw = cell(r, m, 'start');
    const tm = cell(r, m, 'time');
    if (tm && !/\d{1,2}[:.]\d{2}/.test(raw)) raw = `${raw} ${tm}`;
    const start = parseHevyDate(raw, order);
    const exercise = cell(r, m, 'exercise');
    if (!start || !exercise) {
      errors.push(`Строка ${line}: ${!start ? `дата «${raw}» не распознана` : 'нет упражнения'}`);
      return;
    }
    if (start.endsWith('T00:00')) defaultTime = true;
    const title = cell(r, m, 'title');
    // без времени тренировки разных программ в один день не склеиваем — добавляем название к ключу
    const wkey = start.endsWith('T00:00') && title ? `${start}#${title}` : start;
    // тип подхода: из колонки типа или из «номера подхода» вида W/D/F (Strong)
    const setIdxRaw = cell(r, m, 'setIndex');
    const typeRaw = cell(r, m, 'setType') || (/^[a-zа-я]+$/i.test(setIdxRaw) ? setIdxRaw : '');
    const setType = WARMUP.test(typeRaw) ? 'warmup' : DROP.test(typeRaw) ? 'dropset' : FAIL.test(typeRaw) ? 'failure' : 'normal';
    // вхождение упражнения в тренировку
    const om = occ.get(wkey) ?? new Map<string, number>();
    occ.set(wkey, om);
    if (lastEx.get(wkey) !== exercise) om.set(exercise, (om.get(exercise) ?? -1) + 1);
    lastEx.set(wkey, exercise);
    const occurrence = om.get(exercise)!;
    const ck = `${wkey}|${exercise}|${occurrence}`;
    const auto = counter.get(ck) ?? 0;
    counter.set(ck, auto + 1);
    const parsedIdx = /^\d+$/.test(setIdxRaw) ? parseInt(setIdxRaw, 10) : null;
    const setIndex = parsedIdx ?? auto;
    // единица веса
    let unit: 'kg' | 'lbs' = d.unitKnown ?? opt.unit;
    const unitCell = cell(r, m, 'unit').toLowerCase();
    if (/lb|фунт/.test(unitCell)) unit = 'lbs';
    else if (/kg|кг/.test(unitCell)) unit = 'kg';
    const w = num(r, m, 'weight');
    const weightKg = w === null ? null : unit === 'lbs' ? Math.round(w * LB * 100) / 100 : w;
    if (weightKg !== null && (weightKg < 0 || weightKg > 1000)) {
      errors.push(`Строка ${line}: подозрительный вес ${weightKg}`);
      return;
    }
    const distRaw = num(r, m, 'distance');
    const distHeader = m.distance >= 0 ? normHeader(t.header[m.distance]) : '';
    rows.push({
      key: `${start}|${exercise}|${occurrence}|${setIndex}${wkey !== start ? '|' + title : ''}`,
      start,
      end: null,
      title,
      exercise,
      occurrence,
      setIndex,
      setType,
      weightKg,
      reps: num(r, m, 'reps'),
      distanceKm: distRaw === null ? null : /mile|миль/.test(distHeader) ? distRaw * MILE : distRaw,
      durationSec: num(r, m, 'duration'),
      rpe: num(r, m, 'rpe'),
      notes: cell(r, m, 'notes'),
      supersetId: '',
    });
  });
  if (defaultTime) warnings.push('В файле нет времени тренировки — тренировки одного дня различаются по названию.');
  if (!d.unitKnown && m.unit < 0) warnings.push(`Единица веса не указана в файле — используется выбранная: ${opt.unit === 'kg' ? 'кг' : 'фунты'}.`);
  if (!rows.length && errors.length) throw new Error(`Не удалось прочитать ни одной строки. ${errors[0]}`);
  return { rows, errors, warnings };
}
