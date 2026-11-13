// Сон и шаги по дням: ручной ввод и импорт текста из Быстрой команды iOS (или любой таблицы).
// Прямого доступа к «Здоровью» у веб-приложения нет, поэтому данные приходят текстом: вставкой или файлом.
import { parseCsv, parseNum } from './hevy/csv';
import { parseHevyDate, detectDayOrder } from './hevy/dates';
import { normHeader } from './import/table';

export interface DailyEntry {
  date: string;
  steps?: number;
  /** сон в минутах; ночь относится к дате пробуждения */
  sleepMin?: number;
}

/** Длительность → минуты. Понимает «7:35», «7 ч 35 мин», «7h 35m», «7,5» (часы), «455» (минуты). */
export function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/))) return +m[1] * 60 + +m[2];
  if ((m = s.match(/^(\d{1,2})\s*(?:ч|h|hr|hrs|час[а-я]*)\.?\s*(?:(\d{1,2})\s*(?:м|m|min|мин[а-я]*)\.?)?$/))) return +m[1] * 60 + (m[2] ? +m[2] : 0);
  if ((m = s.match(/^(\d{1,3})\s*(?:м|m|min|мин[а-я]*)\.?$/))) return +m[1];
  const n = parseNum(s);
  if (n === null || n < 0) return null;
  // до 24 — это часы (7,5), больше — минуты (455)
  return Math.round(n <= 24 ? n * 60 : n);
}

/** Момент времени → миллисекунды. ISO со смещением разбирается точно, остальное — как местное время. */
export function parseStamp(raw: string, order: 'dmy' | 'mdy' = 'dmy'): number | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T.*([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  }
  const local = parseHevyDate(s, order);
  if (!local) return null;
  const t = new Date(local).getTime();
  return Number.isNaN(t) ? null : t;
}

const localDate = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Сумма длин отрезков без двойного счёта пересечений (iPhone и часы пишут один и тот же сон дважды). */
export function unionMinutes(intervals: Array<[number, number]>): number {
  const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let end = -Infinity;
  for (const [a, b] of sorted) {
    if (b <= end) continue;
    total += b - Math.max(a, end);
    end = b;
  }
  return Math.round(total / 60000);
}

const RE = {
  date: /^date$|^дата$|^day$|^день$/,
  steps: /step|шаг/,
  sleep: /sleep|сон|сна|asleep/,
  start: /start|начал|^from$|^с$/,
  end: /end|конец|оконч|^to$|^по$/,
  stage: /value|stage|значени|стади|фаз|type|тип/,
};
/** Строки «в кровати» и «не сплю» — это не сон. */
const NOT_ASLEEP = /in ?bed|в кровати|в постели|awake|бодрств|не сп/i;

export interface HealthImport {
  rows: DailyEntry[];
  errors: string[];
  /** 'daily' — по строке на день; 'samples' — отрезки сна, которые приложение само сложило по ночам */
  mode: 'daily' | 'samples';
}

export function parseHealthText(text: string): HealthImport {
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (!table.length) throw new Error('Текст пустой');
  const first = table[0].map((c) => c.trim());
  const hasHeader = parseStamp(first[0]) === null;
  const H = hasHeader ? first.map(normHeader) : [];
  const body = hasHeader ? table.slice(1) : table;
  if (!body.length) throw new Error('Есть только строка заголовков, данных нет');
  const order = detectDayOrder(body.map((r) => r[0] ?? ''));
  const find = (re: RegExp) => H.findIndex((h) => re.test(h));
  const errors: string[] = [];

  // ── отрезки сна: начало; конец; (стадия) ──
  const iStart = hasHeader ? find(RE.start) : -1;
  const iEnd = hasHeader ? find(RE.end) : -1;
  const headerlessSamples = !hasHeader && body[0].length >= 2 && parseStamp(body[0][1] ?? '', order) !== null;
  if ((iStart >= 0 && iEnd >= 0) || headerlessSamples) {
    const [cs, ce] = headerlessSamples ? [0, 1] : [iStart, iEnd];
    const cv = headerlessSamples ? 2 : find(RE.stage);
    const byNight = new Map<string, Array<[number, number]>>();
    body.forEach((r, i) => {
      const a = parseStamp(r[cs] ?? '', order);
      const b = parseStamp(r[ce] ?? '', order);
      const line = i + (hasHeader ? 2 : 1);
      if (a === null || b === null) return void errors.push(`Строка ${line}: время не распознано`);
      if (b <= a || b - a > 18 * 3600_000) return void errors.push(`Строка ${line}: отрезок длиннее 18 часов или с перепутанными началом и концом`);
      if (cv >= 0 && NOT_ASLEEP.test(r[cv] ?? '')) return;
      const night = localDate(b);
      byNight.set(night, [...(byNight.get(night) ?? []), [a, b]]);
    });
    const rows = [...byNight.entries()].map(([date, list]) => ({ date, sleepMin: unionMinutes(list) })).filter((r) => r.sleepMin > 0).sort((a, b) => a.date.localeCompare(b.date));
    return { rows, errors, mode: 'samples' };
  }

  // ── по строке на день: дата; шаги; сон ──
  let cDate = 0;
  let cSteps = -1;
  let cSleep = -1;
  if (hasHeader) {
    cDate = Math.max(0, find(RE.date));
    cSteps = find(RE.steps);
    cSleep = find(RE.sleep);
    if (cSteps < 0 && cSleep < 0) throw new Error('В заголовке нет колонок «шаги» или «сон». Первая строка должна быть, например: date;steps;sleep');
  } else {
    // без заголовка: «дата;число» считаем шагами, третья колонка — сон
    cSteps = 1;
    cSleep = body[0].length >= 3 ? 2 : -1;
  }
  const byDate = new Map<string, DailyEntry>();
  body.forEach((r, i) => {
    const line = i + (hasHeader ? 2 : 1);
    const date = parseHevyDate(r[cDate] ?? '', order)?.slice(0, 10);
    if (!date) return void errors.push(`Строка ${line}: дата «${(r[cDate] ?? '').trim()}» не распознана`);
    const cur = byDate.get(date) ?? { date };
    if (cSteps >= 0 && (r[cSteps] ?? '').trim() !== '') {
      const v = parseNum(r[cSteps]);
      if (v === null || v < 0 || v > 200000) errors.push(`Строка ${line}: шаги «${r[cSteps]}» не похожи на число`);
      // несколько строк за день (например, по источникам) складываем
      else cur.steps = Math.round((cur.steps ?? 0) + v);
    }
    if (cSleep >= 0 && (r[cSleep] ?? '').trim() !== '') {
      const v = parseDuration(r[cSleep]);
      if (v === null || v > 18 * 60) errors.push(`Строка ${line}: сон «${r[cSleep]}» не распознан`);
      else cur.sleepMin = v;
    }
    if (cur.steps !== undefined || cur.sleepMin !== undefined) byDate.set(date, cur);
  });
  return { rows: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), errors, mode: 'daily' };
}

/** Новые значения заменяют старые по тем же датам и полям; остальное сохраняется. Повторный импорт дублей не создаёт. */
export function mergeDaily(existing: DailyEntry[], incoming: DailyEntry[]): DailyEntry[] {
  const m = new Map(existing.map((e) => [e.date, { ...e }]));
  for (const r of incoming) m.set(r.date, { ...(m.get(r.date) ?? { date: r.date }), ...r });
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const fmtSleep = (min: number | null | undefined) => (min == null ? '—' : `${Math.floor(min / 60)} ч ${String(Math.round(min % 60)).padStart(2, '0')} мин`);
