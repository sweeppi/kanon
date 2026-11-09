// Мини-парсер CSV/TSV (RFC 4180 + разделители «,», «;», табуляция). Без зависимостей.

export type Delimiter = ',' | ';' | '\t';

/** Определяет разделитель по первой строке (считаем символы вне кавычек). */
export function detectDelimiter(text: string): Delimiter {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  const counts: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && (ch === ',' || ch === ';' || ch === '\t')) counts[ch]++;
  }
  const best = (Object.keys(counts) as Delimiter[]).sort((a, b) => counts[b] - counts[a])[0];
  return counts[best] > 0 ? best : ',';
}

/** Разбор CSV в массив строк (массивов полей). Поддерживает кавычки, "" внутри кавычек и переносы в полях. */
export function parseCsv(text: string, delimiter?: Delimiter): string[][] {
  const src = text.replace(/^﻿/, '');
  const d = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQ = true;
    else if (ch === d) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

/** Экранирование для экспорта CSV (разделитель «;» удобен для русского Excel). */
export function toCsv(rows: Array<Array<string | number | null | undefined>>, delimiter: Delimiter = ';'): string {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? String(v).replace('.', delimiter === ';' ? ',' : '.') : v;
    return s.includes(delimiter) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(delimiter)).join('\r\n');
}

/** Число из строки: «62,5», «62.5», « 1 000 » → number | null. */
export function parseNum(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
