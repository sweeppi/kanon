// Импорт дневника питания из любого приложения: MyFitnessPal, Cronometer, FatSecret, Lose It!, таблицы.
// Точные заголовки этих экспортов публично не задокументированы — сопоставление по синонимам с ручной правкой.
import { parseHevyDate, detectDayOrder } from '../hevy/dates';
import type { FoodEntry } from '../data/db';
import { estimateFiberSugar } from '../calc/foodEstimate';
import { cell, num, guessMapping, normHeader, missingRequired, type FieldDef, type Mapping, type Table, type ImportResult } from './table';

export const FOOD_IMPORT_FIELDS: FieldDef[] = [
  { key: 'date', label: 'Дата', required: true, synonyms: [/^date$|^day$|^дата$/, /date|day|дата|день/] },
  { key: 'name', label: 'Продукт / блюдо', synonyms: [/food name|^food$|^name$|description|продукт|блюдо|название|еда/] },
  { key: 'meal', label: 'Приём пищи', synonyms: [/^meal|^group$|приём|прием|meal name/] },
  { key: 'kcal', label: 'Ккал', required: true, synonyms: [/energy \(kcal\)|^calories|^kcal|ккал|калори|энерг/] },
  { key: 'kj', label: 'кДж (если нет ккал)', synonyms: [/kj|кдж/] },
  { key: 'protein', label: 'Белки, г', synonyms: [/^protein|белк|белок/] },
  { key: 'fat', label: 'Жиры, г', synonyms: [/^fat|^total fat|жир/] },
  { key: 'carbs', label: 'Углеводы, г', synonyms: [/^carb|carbohydrate|net carbs|углевод/] },
  { key: 'fiber', label: 'Клетчатка, г', synonyms: [/fiber|fibre|клетчатк|пищев[\wа-яё]* волокн/] },
  { key: 'sugar', label: 'Сахар, г', synonyms: [/sugar|сахар/] },
  { key: 'grams', label: 'Вес порции, г', synonyms: [/^amount|^grams|^weight|^вес|граммы|^g$|порци/] },
];

export function detectFoods(t: Table): Mapping {
  // «Fat (g)» и «Saturated Fat (g)»: насыщенные не путаем с общими жирами
  const H = t.header.map((h) => {
    const n = normHeader(h);
    return /saturated|trans|mono|poly|насыщ|транс/.test(n) ? '' : n;
  });
  return guessMapping(H, FOOD_IMPORT_FIELDS);
}

export function parseFoodTable(t: Table, m: Mapping): ImportResult<Omit<FoodEntry, 'id'> & { fiberEstimated?: boolean; sugarEstimated?: boolean }> {
  const miss = missingRequired(m, FOOD_IMPORT_FIELDS).filter((f) => !(f.key === 'kcal' && (m.kj ?? -1) >= 0));
  if (miss.length) throw new Error(`Укажите колонку: ${miss.map((f) => f.label).join(', ')}`);
  const order = detectDayOrder(t.rows.map((r) => cell(r, m, 'date')));
  const rows: Array<Omit<FoodEntry, 'id'> & { fiberEstimated?: boolean; sugarEstimated?: boolean }> = [];
  const errors: string[] = [];
  t.rows.forEach((r, i) => {
    const date = parseHevyDate(cell(r, m, 'date'), order)?.slice(0, 10);
    if (!date) {
      errors.push(`Строка ${i + 2}: дата «${cell(r, m, 'date')}» не распознана`);
      return;
    }
    let kcal = num(r, m, 'kcal');
    if (kcal === null) {
      const kj = num(r, m, 'kj');
      kcal = kj === null ? null : kj / 4.184;
    }
    if (kcal === null) {
      errors.push(`Строка ${i + 2}: нет калорий`);
      return;
    }
    const carbs = num(r, m, 'carbs') ?? 0;
    const meal = cell(r, m, 'meal');
    const name = cell(r, m, 'name') || meal || 'Импорт';
    const fs = estimateFiberSugar(name, carbs, num(r, m, 'fiber'), num(r, m, 'sugar'));
    rows.push({
      date,
      name: meal && cell(r, m, 'name') ? `${name} (${meal})` : name,
      kcal: Math.round(kcal),
      protein: num(r, m, 'protein') ?? 0,
      fat: num(r, m, 'fat') ?? 0,
      carbs,
      fiber: fs.fiber,
      sugar: fs.sugar,
      fiberEstimated: fs.fiberEstimated || undefined,
      sugarEstimated: fs.sugarEstimated || undefined,
      grams: num(r, m, 'grams') ?? undefined,
      source: 'import',
    });
  });
  if (!rows.length && errors.length) throw new Error(`Не удалось прочитать ни одной строки. ${errors[0]}`);
  return { rows, errors };
}

/** Ключ дубля: дата + название + ккал + белок (повторный импорт того же файла не задваивает дневник). */
export const foodKey = (f: Pick<FoodEntry, 'date' | 'name' | 'kcal' | 'protein'>) => `${f.date}|${f.name}|${Math.round(f.kcal)}|${Math.round(f.protein * 10)}`;
