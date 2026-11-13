// Этап 5: сон и шаги из «Здоровья» (текст Быстрой команды), статистика за период. Данные вымышленные.
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDuration, parseHealthText, mergeDaily, unionMinutes, parseStamp, fmtSleep } from '../src/lib/daily';
import { periodStats, longestStreak, recentStepsAvg } from '../src/lib/stats';
import { KanonDB } from '../src/lib/data/db';
import { exportBackup, importBackup, canonical } from '../src/lib/data/backup';
import { evaluateAdvice } from '../src/lib/advice/engine';
import type { WorkoutSet } from '../src/lib/hevy/hevy';

const fx = (n: string) => readFileSync(resolve(__dirname, 'fixtures', n), 'utf8');

describe('Длительность сна', () => {
  it('разные записи одного и того же', () => {
    expect(parseDuration('7:35')).toBe(455);
    expect(parseDuration('7:35:10')).toBe(455);
    expect(parseDuration('7 ч 35 мин')).toBe(455);
    expect(parseDuration('7h 35m')).toBe(455);
    expect(parseDuration('7,5')).toBe(450);
    expect(parseDuration('455')).toBe(455);
    expect(parseDuration('8 ч')).toBe(480);
    expect(parseDuration('45 мин')).toBe(45);
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('плохо')).toBeNull();
    expect(fmtSleep(455)).toBe('7 ч 35 мин');
  });
});

describe('Импорт из Быстрой команды: по строке на день', () => {
  it('заголовок date;steps;sleep, русские даты, сон в разных видах', () => {
    const r = parseHealthText(fx('health_daily.csv'));
    expect(r.mode).toBe('daily');
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { date: '2025-03-01', steps: 8432, sleepMin: 455 },
      { date: '2025-03-02', steps: 12050, sleepMin: 390 },
      { date: '2025-03-03', steps: 4210 },
      { date: '2025-03-04', sleepMin: 480 },
    ]);
  });

  it('без заголовка: «дата;число» — это шаги; строки одного дня складываются', () => {
    const r = parseHealthText('2025-03-01;5000\n2025-03-01;1200\n02.03.2025;7000\n');
    expect(r.rows).toEqual([{ date: '2025-03-01', steps: 6200 }, { date: '2025-03-02', steps: 7000 }]);
  });

  it('русский заголовок и запятая-разделитель', () => {
    const r = parseHealthText('Дата,Шаги,Сон\n01.03.2025,9000,7:10\n');
    expect(r.rows).toEqual([{ date: '2025-03-01', steps: 9000, sleepMin: 430 }]);
  });

  it('плохие строки не ломают импорт и перечислены в ошибках', () => {
    const r = parseHealthText('date;steps\nкогда-то;100\n2025-03-01;много\n2025-03-02;8000\n');
    expect(r.rows).toEqual([{ date: '2025-03-02', steps: 8000 }]);
    expect(r.errors).toHaveLength(2);
  });

  it('пустой текст и заголовок без нужных колонок — понятная ошибка', () => {
    expect(() => parseHealthText('  \n')).toThrow('пустой');
    expect(() => parseHealthText('date;heart\n2025-03-01;60\n')).toThrow('шаги');
    expect(() => parseHealthText('date;steps\n')).toThrow('данных нет');
  });
});

describe('Импорт из Быстрой команды: отрезки сна', () => {
  it('стадии складываются по ночам, «в кровати» и «не сплю» не считаются, ночь — по дате пробуждения', () => {
    const r = parseHealthText(fx('health_sleep_samples.csv'));
    expect(r.mode).toBe('samples');
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { date: '2025-03-02', sleepMin: 420 }, // 23:30–03:00 + 03:10–06:40
      { date: '2025-03-03', sleepMin: 450 }, // пересечение записей телефона и часов не удваивается
    ]);
  });

  it('пересекающиеся отрезки считаются один раз', () => {
    const h = 3600_000;
    expect(unionMinutes([[0, 2 * h], [1 * h, 3 * h], [5 * h, 6 * h]])).toBe(240);
    expect(unionMinutes([[0, h], [0, h]])).toBe(60);
    expect(unionMinutes([[h, 0]])).toBe(0);
  });

  it('без заголовка: две колонки времени — это отрезки', () => {
    const r = parseHealthText('2025-03-01 23:00;2025-03-02 07:00;Asleep\n');
    expect(r.rows).toEqual([{ date: '2025-03-02', sleepMin: 480 }]);
  });

  it('время со смещением ISO разбирается как момент, а не как местная запись', () => {
    expect(parseStamp('2025-03-02T04:00:00Z')).toBe(Date.UTC(2025, 2, 2, 4, 0));
    expect(parseStamp('2025-03-02T07:00:00+03:00')).toBe(Date.UTC(2025, 2, 2, 4, 0));
    expect(parseStamp('не дата')).toBeNull();
  });

  it('перепутанные начало и конец или слишком длинный отрезок — в ошибки', () => {
    const r = parseHealthText('start;end\n2025-03-02 07:00;2025-03-01 23:00\n2025-03-01 00:00;2025-03-02 23:00\n');
    expect(r.rows).toEqual([]);
    expect(r.errors).toHaveLength(2);
  });
});

describe('Слияние с уже записанным', () => {
  it('новое заменяет старое по тем же полям, остальное сохраняется, дублей нет', () => {
    const a = [{ date: '2025-03-01', steps: 5000, sleepMin: 400 }, { date: '2025-03-02', steps: 100 }];
    const b = [{ date: '2025-03-01', steps: 8000 }, { date: '2025-03-03', sleepMin: 450 }];
    const m = mergeDaily(a, b);
    expect(m).toEqual([{ date: '2025-03-01', steps: 8000, sleepMin: 400 }, { date: '2025-03-02', steps: 100 }, { date: '2025-03-03', sleepMin: 450 }]);
    expect(mergeDaily(m, b)).toEqual(m);
  });
});

describe('Статистика за период', () => {
  const set = (start: string, w: number, reps: number, type = 'normal'): WorkoutSet => ({ key: `${start}${w}${reps}${type}`, start, end: null, title: 'Т', exercise: 'Жим штанги лёжа', occurrence: 0, setIndex: 0, setType: type, weightKg: w, reps, distanceKm: null, durationSec: null, rpe: null, notes: '', supersetId: '' });
  const inp = {
    ms: [{ date: '2025-03-01', weight: 82 }, { date: '2025-03-06', weight: 81 }, { date: '2025-03-09', weight: 80 }, { date: '2025-03-10', neck: 39 }],
    sets: [set('2025-03-02T18:00', 80, 8), set('2025-03-02T18:00', 40, 10, 'warmup'), set('2025-03-09T18:00', 82.5, 8), set('2025-03-10T18:00', 60, 10)],
    foods: [
      { date: '2025-03-03', name: 'a', kcal: 2000, protein: 150, fat: 0, carbs: 0 },
      { date: '2025-03-09', name: 'b', kcal: 1000, protein: 80, fat: 0, carbs: 0 },
      { date: '2025-03-09', name: 'c', kcal: 1200, protein: 60, fat: 0, carbs: 0 },
      { date: '2025-03-10', name: 'd', kcal: 2400, protein: 160, fat: 0, carbs: 0 },
    ],
    daily: [{ date: '2025-03-02', steps: 6000, sleepMin: 420 }, { date: '2025-03-08', steps: 9000, sleepMin: 480 }, { date: '2025-03-10', steps: 11000 }],
    water: new Map([['2025-03-09', 1500], ['2025-03-10', 2500], ['2025-03-01', 1000]]),
  };

  it('7 дней: текущий период 04–10.03, предыдущий 25.02–03.03', () => {
    const { cur, prev } = periodStats(inp, 7, '2025-03-10');
    expect([cur.from, cur.to, prev.from, prev.to]).toEqual(['2025-03-04', '2025-03-10', '2025-02-25', '2025-03-03']);
    expect(cur.weightAvg).toBe(80.5);
    expect(cur.weighIns).toBe(2);
    expect(cur.kcalAvg).toBe(2300); // (2200 + 2400) / 2 дня
    expect(cur.proteinAvg).toBe(150);
    expect(cur.foodDays).toBe(2);
    expect(cur.stepsAvg).toBe(10000);
    expect(cur.sleepAvgMin).toBe(480);
    expect(cur.sleepNights).toBe(1);
    expect(cur.waterAvgMl).toBe(2000);
    expect(cur.workouts).toBe(2);
    expect(cur.workingSets).toBe(2);
    expect(cur.tonnage).toBe(1260);
    expect(cur.activeDays).toBe(3); // 06, 09, 10
    expect(prev.weightAvg).toBe(82);
    expect(prev.workingSets).toBe(1); // разминка не считается
    expect(prev.tonnage).toBe(640);
    expect(prev.kcalAvg).toBe(2000);
    expect(prev.stepsAvg).toBe(6000);
  });

  it('пустой период даёт null, а не ноль', () => {
    const { cur } = periodStats({ ms: [], sets: [], foods: [], daily: [], water: new Map() }, 30, '2025-03-10');
    expect([cur.weightAvg, cur.kcalAvg, cur.stepsAvg, cur.sleepAvgMin, cur.waterAvgMl]).toEqual([null, null, null, null, null]);
    expect([cur.workouts, cur.activeDays]).toEqual([0, 0]);
  });

  it('самая длинная серия и среднее шагов за неделю', () => {
    expect(longestStreak(['2025-03-01', '2025-03-02', '2025-03-04', '2025-03-05', '2025-03-06', '2025-03-06'])).toBe(3);
    expect(longestStreak(['2025-02-28', '2025-03-01'])).toBe(2);
    expect(longestStreak([])).toBe(0);
    const d = ['04', '05', '06', '07'].map((x, i) => ({ date: `2025-03-${x}`, steps: 8000 + i * 1000 }));
    expect(recentStepsAvg(d, '2025-03-10')).toBe(9500);
    expect(recentStepsAvg(d.slice(0, 3), '2025-03-10')).toBeNull(); // меньше 4 дней — не подсказываем
  });
});

describe('Совет про сон', () => {
  it('срабатывает при среднем меньше 7 часов за 5+ ночей и молчит без данных', () => {
    const low = evaluateAdvice({ sleepAvgHours: 6.1, sleepNights: 9 });
    expect(low.some((a) => a.id === 'sleep-low' && a.text.includes('6,1'))).toBe(true);
    expect(evaluateAdvice({ sleepAvgHours: 6.1, sleepNights: 3 }).some((a) => a.id === 'sleep-low')).toBe(false);
    expect(evaluateAdvice({ sleepAvgHours: 7.6, sleepNights: 9 }).some((a) => a.id === 'sleep-low')).toBe(false);
    expect(evaluateAdvice({}).some((a) => a.id === 'sleep-low')).toBe(false);
  });
});

describe('Сон и шаги в бэкапе', () => {
  it('таблица daily восстанавливается', async () => {
    const db = new KanonDB('test-daily');
    await db.daily.bulkPut([{ date: '2025-03-01', steps: 8432, sleepMin: 455 }, { date: '2025-03-02', steps: 100 }]);
    const before = await exportBackup(db);
    await db.daily.clear();
    await importBackup(JSON.parse(JSON.stringify(before)), db);
    expect(await db.daily.get('2025-03-01')).toEqual({ date: '2025-03-01', steps: 8432, sleepMin: 455 });
    expect(canonical(await exportBackup(db))).toBe(canonical(before));
    db.close();
  });
});
