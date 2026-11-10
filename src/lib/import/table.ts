// Универсальный импорт таблиц: CSV/TSV из любого приложения → поля приложения.
// Колонки сопоставляются автоматически по синонимам (англ./рус.), пользователь может поправить в превью.
import { parseCsv, parseNum } from '../hevy/csv';

export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  /** проверяются по нормализованному заголовку; первое совпадение выигрывает */
  synonyms: RegExp[];
}

export type Mapping = Record<string, number>; // поле → индекс колонки (-1 — нет)

export const normHeader = (h: string) =>
  h
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ');

export interface Table {
  header: string[];
  rows: string[][];
}

export function readTable(text: string): Table {
  const t = parseCsv(text);
  if (!t.length) throw new Error('Файл пустой');
  return { header: t[0], rows: t.slice(1).filter((r) => r.some((c) => c.trim() !== '')) };
}

/** Автосопоставление: для каждого поля — первая подходящая ещё не занятая колонка. */
export function guessMapping(header: string[], fields: FieldDef[]): Mapping {
  const H = header.map(normHeader);
  const used = new Set<number>();
  const m: Mapping = {};
  for (const f of fields) {
    m[f.key] = -1;
    for (const re of f.synonyms) {
      const idx = H.findIndex((h, i) => !used.has(i) && re.test(h));
      if (idx >= 0) {
        m[f.key] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return m;
}

export const missingRequired = (m: Mapping, fields: FieldDef[]) => fields.filter((f) => f.required && (m[f.key] ?? -1) < 0);

export const cell = (row: string[], m: Mapping, key: string) => {
  const i = m[key] ?? -1;
  return i >= 0 ? (row[i] ?? '').trim() : '';
};
export const num = (row: string[], m: Mapping, key: string) => parseNum(cell(row, m, key));

/** Единица веса из заголовка колонки: «Weight (lbs)», «weight_lbs», «Вес, фунт». */
export function unitFromHeader(h: string | undefined): 'kg' | 'lbs' | null {
  if (!h) return null;
  const n = normHeader(h);
  if (/\blbs?\b|pound|фунт/.test(n)) return 'lbs';
  if (/\bkgs?\b|кг|kilo/.test(n)) return 'kg';
  return null;
}

export interface ImportResult<T> {
  rows: T[];
  errors: string[];
}
