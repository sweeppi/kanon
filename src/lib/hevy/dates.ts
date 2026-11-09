// Разбор дат из экспорта Hevy в разных локалях. Результат — локальное время «YYYY-MM-DDTHH:mm».

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  янв: 1, фев: 2, мар: 3, апр: 4, мая: 5, май: 5, июн: 6, июл: 7, авг: 8, сен: 9, сент: 9, окт: 10, ноя: 11, дек: 12,
};

export type DayOrder = 'dmy' | 'mdy';

const pad = (n: number) => String(n).padStart(2, '0');

function build(y: number, m: number, d: number, hh = 0, mm = 0): string | null {
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && hh >= 0 && hh < 24 && mm >= 0 && mm < 60)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // 31 февраля и т. п.
  return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}`;
}

function parseTime(rest: string): [number, number] | null {
  const t = rest.match(/(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap]\.?\s?m\.?)?/i);
  if (!t) return rest.trim() === '' ? [0, 0] : null;
  let h = +t[1];
  const mi = +t[2];
  const ampm = t[3]?.toLowerCase().replace(/[.\s]/g, '');
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return [h, mi];
}

/** Определение порядка день/месяц по всем датам файла с «/» (если где-то первое число > 12 → день первый). */
export function detectDayOrder(samples: string[]): DayOrder {
  let dmy = 0;
  let mdy = 0;
  for (const s of samples) {
    const m = s.match(/^\s*(\d{1,2})\/(\d{1,2})\/\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) dmy++;
    if (+m[2] > 12) mdy++;
  }
  return mdy > dmy ? 'mdy' : 'dmy';
}

export function parseHevyDate(raw: string, order: DayOrder = 'dmy'): string | null {
  const s = raw.trim().replace(/\s+г\.?/, '').replace(/,/g, ' ').replace(/\s+/g, ' ');
  let m: RegExpMatchArray | null;
  // ISO: 2024-01-26T18:03:00Z или 2024-01-26 18:03
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/))) {
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) && s.includes('T')) {
      const d = new Date(s.replace(' ', ''));
      if (!isNaN(d.getTime()))
        return build(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes());
    }
    return build(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  }
  // 26.01.2024 18:03
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s*(.*)$/))) {
    const t = parseTime(m[4]);
    return t ? build(+m[3], +m[2], +m[1], t[0], t[1]) : null;
  }
  // 01/26/2024 18:03 или 26/01/2024
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*(.*)$/))) {
    const t = parseTime(m[4]);
    const [d, mo] = order === 'mdy' ? [+m[2], +m[1]] : [+m[1], +m[2]];
    return t ? build(+m[3], mo, d, t[0], t[1]) : null;
  }
  // 26 Jan 2024 18:03 / 26 янв. 2024 18:03 / 26 января 2024
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-zА-Яа-яё.]+)\s+(\d{4})\s*(.*)$/))) {
    const mon = MONTHS[m[2].toLowerCase().replace('.', '').slice(0, 4)] ?? MONTHS[m[2].toLowerCase().slice(0, 3)];
    const t = parseTime(m[4]);
    return mon && t ? build(+m[3], mon, +m[1], t[0], t[1]) : null;
  }
  // Jan 26 2024 6:03 PM
  if ((m = s.match(/^([A-Za-z.]+)\s+(\d{1,2})\s+(\d{4})\s*(.*)$/))) {
    const mon = MONTHS[m[1].toLowerCase().replace('.', '').slice(0, 3)];
    const t = parseTime(m[4]);
    return mon && t ? build(+m[3], mon, +m[2], t[0], t[1]) : null;
  }
  return null;
}
