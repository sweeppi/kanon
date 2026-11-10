// Импорт замеров из любого приложения / умных весов / таблицы: Hevy, Strong, Zepp, Mi Fit, Excel и т. п.
import { parseHevyDate, detectDayOrder } from '../hevy/dates';
import { LB } from '../hevy/hevy';
import type { MeasureField } from '../data/db';
import { cell, num, guessMapping, normHeader, missingRequired, type FieldDef, type Mapping, type Table, type ImportResult } from './table';

export interface ImportedMeasurement {
  date: string;
  values: Partial<Record<MeasureField, number>>;
}

const L = '(?:left |l |левая |лев[\\wа-яё]* )?';
// Правую сторону не сопоставляем автоматически: берём левую (как в 3D-модели)
export const MEASURE_IMPORT_FIELDS: FieldDef[] = [
  { key: 'date', label: 'Дата', required: true, synonyms: [/^date$|^дата$/, /date|дата|time|время|day|день/] },
  { key: 'weight', label: 'Вес', synonyms: [/^(body )?weight|^вес|^масса тела|^mass$/] },
  { key: 'bodyFatInput', label: '% жира', synonyms: [/fat ?(rate|percent|%|pct)|body ?fat|bodyfat|жир|fat$/] },
  { key: 'height', label: 'Рост', synonyms: [/^height|^рост/] },
  { key: 'neck', label: 'Шея', synonyms: [/neck|шея|шеи/] },
  { key: 'shoulders', label: 'Плечи', synonyms: [/shoulder|плеч/] },
  { key: 'chest', label: 'Грудь', synonyms: [/chest|bust|груд/] },
  { key: 'waist', label: 'Талия', synonyms: [/waist|тали/, /abdomen|живот/] },
  { key: 'hips', label: 'Таз / бёдра (ягодицы)', synonyms: [/^hips?|hip circ|таз|ягодиц/] },
  { key: 'thigh', label: 'Бедро', synonyms: [new RegExp(`^${L}(thigh|бедр)`), /thigh|бедро/] },
  { key: 'knee', label: 'Колено', synonyms: [/knee|колен/] },
  { key: 'calf', label: 'Голень', synonyms: [new RegExp(`^${L}(calf|голен|икр)`), /calf|голен|икр/] },
  { key: 'ankle', label: 'Лодыжка', synonyms: [/ankle|лодыж/] },
  { key: 'forearm', label: 'Предплечье', synonyms: [new RegExp(`^${L}(forearm|предплеч)`), /forearm|предплеч/] },
  { key: 'bicepsFlexed', label: 'Бицепс в напряжении', synonyms: [/(bicep|biceps|arm|бицепс|рук).*(flex|напряж)/, /flex.*(bicep|arm)/] },
  { key: 'bicepsRelaxed', label: 'Бицепс расслабленный', synonyms: [new RegExp(`^${L}(biceps?|upper arm|arm|бицепс|рук)`), /bicep|upper arm|бицепс/] },
  { key: 'tricepsFlexed', label: 'Трицепс в напряжении', synonyms: [/tricep|трицепс/] },
  { key: 'wrist', label: 'Запястье', synonyms: [/wrist|запяст/] },
];

export interface DetectedMeasurements {
  mapping: Mapping;
  /** единицы из заголовков: фунты/дюймы → пересчёт */
  factors: Record<string, number>;
}

export function detectMeasurements(t: Table): DetectedMeasurements {
  const H = t.header.map(normHeader);
  // правые стороны не берём, если есть левые
  const masked = H.map((h) => (/^(right|r|правая|прав[\wа-яё]*)(?=\s|$)/.test(h) ? '' : h));
  const mapping = guessMapping(masked, MEASURE_IMPORT_FIELDS);
  const factors: Record<string, number> = {};
  for (const [k, i] of Object.entries(mapping)) {
    if (i < 0) continue;
    const h = H[i];
    if (/\blbs?\b|pound|фунт/.test(h)) factors[k] = LB;
    else if (/\bin\b|inch|дюйм|_in$| in\)?$/.test(h)) factors[k] = 2.54;
    else factors[k] = 1;
  }
  return { mapping, factors };
}

export function parseMeasurementTable(t: Table, d: DetectedMeasurements): ImportResult<ImportedMeasurement> {
  const m = d.mapping;
  const miss = missingRequired(m, MEASURE_IMPORT_FIELDS);
  if (miss.length) throw new Error(`Укажите колонку: ${miss.map((f) => f.label).join(', ')}`);
  const valueKeys = MEASURE_IMPORT_FIELDS.filter((f) => f.key !== 'date' && (m[f.key] ?? -1) >= 0).map((f) => f.key);
  if (!valueKeys.length) throw new Error('Не нашёл ни одной колонки замеров — сопоставьте вручную');
  const order = detectDayOrder(t.rows.map((r) => cell(r, m, 'date')));
  const byDate = new Map<string, ImportedMeasurement>();
  const errors: string[] = [];
  t.rows.forEach((r, i) => {
    const date = parseHevyDate(cell(r, m, 'date'), order)?.slice(0, 10);
    if (!date) {
      errors.push(`Строка ${i + 2}: дата «${cell(r, m, 'date')}» не распознана`);
      return;
    }
    const cur = byDate.get(date) ?? { date, values: {} };
    for (const k of valueKeys) {
      const v = num(r, m, k);
      if (v === null || !(v > 0)) continue;
      cur.values[k as MeasureField] = Math.round(v * (d.factors[k] ?? 1) * 10) / 10; // несколько записей за день — берём последнюю
    }
    if (Object.keys(cur.values).length) byDate.set(date, cur);
  });
  return { rows: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), errors };
}
