// Тренды временных рядов. Дата — строка YYYY-MM-DD или число (мс).

export interface Point {
  date: string; // YYYY-MM-DD
  value: number;
}

export const DAY = 86_400_000;
export const toMs = (d: string) => Date.parse(d + 'T00:00:00Z');
export const daysBetween = (a: string, b: string) => (toMs(b) - toMs(a)) / DAY;
export const addDays = (d: string, n: number) => new Date(toMs(d) + n * DAY).toISOString().slice(0, 10);

const sorted = (pts: Point[]) => [...pts].filter((p) => Number.isFinite(p.value)).sort((a, b) => toMs(a.date) - toMs(b.date));

/** Скользящее среднее за окно в календарных днях (включая текущий день). */
export function movingAverage(points: Point[], windowDays = 7): Point[] {
  const s = sorted(points);
  return s.map((p, i) => {
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0 && daysBetween(s[j].date, p.date) < windowDays; j--) {
      sum += s[j].value;
      n++;
    }
    return { date: p.date, value: sum / n };
  });
}

/**
 * EMA с учётом пропусков: α = 1 − exp(−Δt/τ). При ежедневных взвешиваниях и τ = 7 дней
 * сглаживание близко к классическому EMA с α ≈ 0.13. Пропуски не «разгоняют» тренд.
 */
export function ema(points: Point[], tauDays = 7): Point[] {
  const s = sorted(points);
  const out: Point[] = [];
  let prev: Point | null = null;
  for (const p of s) {
    if (!prev) {
      prev = { date: p.date, value: p.value };
    } else {
      const dt = Math.max(0, daysBetween(prev.date, p.date));
      const alpha = 1 - Math.exp(-dt / tauDays);
      prev = { date: p.date, value: prev.value + alpha * (p.value - prev.value) };
    }
    out.push(prev);
  }
  return out;
}

/** Линейная регрессия value(day). Возвращает наклон в единицах/день. */
export function linearSlope(points: Point[]): { slope: number; intercept: number; r2: number } | null {
  const s = sorted(points);
  if (s.length < 2) return null;
  const x0 = toMs(s[0].date);
  const xs = s.map((p) => (toMs(p.date) - x0) / DAY);
  const ys = s.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept: my - slope * mx, r2 };
}

/** Точки за последние N дней относительно последней даты ряда (или указанной). */
export function lastDays(points: Point[], days: number, until?: string): Point[] {
  const s = sorted(points);
  if (!s.length) return [];
  const end = until ?? s[s.length - 1].date;
  return s.filter((p) => daysBetween(p.date, end) < days && daysBetween(p.date, end) >= 0);
}
