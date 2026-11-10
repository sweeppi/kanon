import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseHevyWorkouts, parseHevyMeasurements, previewImport, FormatError } from '../src/lib/hevy/hevy';
import { parseCsv, detectDelimiter, toCsv, parseNum } from '../src/lib/hevy/csv';
import { parseHevyDate, detectDayOrder } from '../src/lib/hevy/dates';
import { weeklySetsPerMuscle, weeklyTonnage, personalRecords, patternStrength, strengthSummary, e1rmSeries, weekStart } from '../src/lib/hevy/training';
import { lookupExercise } from '../src/lib/hevy/exercises';

// Все файлы — фиктивные, реальные данные пользователя в тестах не используются.
const fx = (n: string) => readFileSync(resolve(__dirname, 'fixtures', n), 'utf8');

describe('CSV', () => {
  it('разделители , ; TAB', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a;b;c')).toBe(';');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
  });
  it('кавычки, "" и переносы внутри поля', () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi""\nnext"\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"\nnext'],
    ]);
  });
  it('числа с запятой', () => {
    expect(parseNum('62,5')).toBe(62.5);
    expect(parseNum('')).toBeNull();
    expect(parseNum('abc')).toBeNull();
  });
  it('экспорт CSV для Excel (BOM, ;)', () => {
    const s = toCsv([['a', 'b'], [1.5, 'x;y']]);
    expect(s.startsWith('﻿')).toBe(true);
    expect(s).toContain('1,5;"x;y"');
  });
});

describe('Даты Hevy', () => {
  it('разные локали', () => {
    expect(parseHevyDate('3 Feb 2025, 08:00')).toBe('2025-02-03T08:00');
    expect(parseHevyDate('12 февр. 2025 г., 07:15')).toBe('2025-02-12T07:15');
    expect(parseHevyDate('12 февраля 2025, 07:15')).toBe('2025-02-12T07:15');
    expect(parseHevyDate('10.02.2025, 18:30')).toBe('2025-02-10T18:30');
    expect(parseHevyDate('2025-02-14 07:00:00')).toBe('2025-02-14T07:00');
    expect(parseHevyDate('Feb 3, 2025, 6:05 PM')).toBe('2025-02-03T18:05');
    expect(parseHevyDate('02/13/2025 08:00', 'mdy')).toBe('2025-02-13T08:00');
    expect(parseHevyDate('13/02/2025 08:00', 'dmy')).toBe('2025-02-13T08:00');
    expect(parseHevyDate('31.02.2025')).toBeNull();
    expect(parseHevyDate('не дата')).toBeNull();
  });
  it('определение порядка день/месяц по файлу', () => {
    expect(detectDayOrder(['02/13/2025', '02/01/2025'])).toBe('mdy');
    expect(detectDayOrder(['13/02/2025'])).toBe('dmy');
  });
});

describe('Импорт тренировок', () => {
  it('кг: все подходы, разминка помечена, кардио без веса', () => {
    const r = parseHevyWorkouts(fx('hevy_workouts_kg.csv'));
    expect(r.unit).toBe('kg');
    expect(r.rows).toHaveLength(12);
    expect(r.errors).toHaveLength(0);
    expect(r.rows.filter((s) => s.setType === 'warmup')).toHaveLength(2);
    const tm = r.rows.find((s) => s.exercise === 'Treadmill')!;
    expect(tm.weightKg).toBeNull();
    expect(tm.distanceKm).toBe(2.5);
    expect(r.rows.find((s) => s.exercise.startsWith('Deadlift'))!.notes).toBe('Ремень, "сумо" нет');
  });
  it('фунты + «;» + русские даты + десятичная запятая', () => {
    const r = parseHevyWorkouts(fx('hevy_workouts_lbs_semicolon.csv'));
    expect(r.unit).toBe('lbs');
    expect(r.rows).toHaveLength(4);
    expect(r.rows[0].weightKg).toBeCloseTo(80, 1); // 176.37 lb
    expect(r.rows[0].rpe).toBe(8.5);
    expect(r.rows[2].weightKg).toBeCloseTo(29.94, 2);
    expect(r.rows[3].start).toBe('2025-02-12T07:15');
    expect(r.rows[3].distanceKm).toBeCloseTo(4.828, 3);
  });
  it('TSV и ISO-даты', () => {
    const r = parseHevyWorkouts(fx('hevy_workouts.tsv'));
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].start).toBe('2025-02-14T07:00');
  });
  it('битый файл → понятная ошибка формата', () => {
    expect(() => parseHevyWorkouts(fx('broken.csv'))).toThrow(FormatError);
    expect(() => parseHevyWorkouts('')).toThrow(FormatError);
  });
  it('битые строки пропускаются с номером строки', () => {
    const r = parseHevyWorkouts(fx('broken_rows.csv'));
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toMatch(/Строка 2/);
  });
  it('повторный импорт не создаёт дублей', () => {
    const r = parseHevyWorkouts(fx('hevy_workouts_kg.csv'));
    const first = previewImport(r.rows, new Set());
    expect(first).toMatchObject({ workouts: 3, newWorkouts: 3, duplicateWorkouts: 0, newSets: 12, duplicateSets: 0 });
    const existing = new Set(r.rows.map((s) => s.key));
    const again = previewImport(parseHevyWorkouts(fx('hevy_workouts_kg.csv')).rows, existing);
    expect(again).toMatchObject({ newWorkouts: 0, duplicateWorkouts: 3, newSets: 0, duplicateSets: 12 });
  });
  it('одно упражнение дважды в тренировке — разные ключи', () => {
    const csv = [
      'title,start_time,exercise_title,set_index,set_type,weight_kg,reps',
      'A,2025-02-01 08:00,Bench Press (Barbell),0,normal,80,5',
      'A,2025-02-01 08:00,Bench Press (Barbell),1,normal,80,5',
      'A,2025-02-01 08:00,Pull Up,0,normal,0,8',
      'A,2025-02-01 08:00,Bench Press (Barbell),0,normal,60,10',
    ].join('\n');
    const keys = parseHevyWorkouts(csv).rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(4);
  });
});

describe('Аналитика тренировок', () => {
  const sets = parseHevyWorkouts(fx('hevy_workouts_kg.csv')).rows;
  it('рабочие подходы на мышцу в неделю (разминка не считается)', () => {
    const w = weeklySetsPerMuscle(sets);
    const wk = weekStart('2025-02-03');
    expect(wk).toBe('2025-02-03');
    expect(w[wk].chest).toBe(2); // 2 рабочих жима
    expect(w[wk].triceps).toBe(1); // 2 × 0.5
    expect(w[wk].quads).toBe(2.5); // присед 2 + становая 0.5
    expect(w[wk].shoulders).toBe(2 + 1); // махи 2 + жим 2×0.5
  });
  it('тоннаж без разминки', () => {
    const t = weeklyTonnage(sets);
    // жим 80×6 + 80×5 = 880; махи 10×15 + 8×12 = 246; присед 100×5 + 100×4 = 900; тяга 140×3 = 420
    expect(t['2025-02-03']).toBe(880 + 246 + 900 + 420);
  });
  it('рекорды и 1ПМ по ключевым упражнениям', () => {
    const pr = personalRecords(sets).find((p) => p.exercise === 'Bench Press (Barbell)')!;
    expect(pr.heaviest).toBe(80);
    expect(pr.bestE1rm).toBeCloseTo((80 * 1.2 + (80 * 36) / 31) / 2, 3);
    const k = patternStrength(sets, 80);
    expect(k.hPush?.e1rm).toBeGreaterThan(90);
    expect(k.squat?.e1rm).toBeGreaterThan(110);
    expect(k.hinge?.e1rm).toBeGreaterThan(150);
    // подтягивания с весом 0 = вес тела: (80+0)·(1+10/30)… / 80 > 1
    expect(k.vPull?.exercise).toBe('Pull Up');
    expect(k.vPull!.ratio).toBeGreaterThan(1.2);
    expect(strengthSummary(k)!.score).toBeGreaterThan(0);
    expect(e1rmSeries(sets, 'Squat (Barbell)')).toHaveLength(1);
  });
  it('справочник упражнений и осевая нагрузка', () => {
    expect(lookupExercise('Squat (Barbell)')!.axial).toBe(true);
    expect(lookupExercise('Leg Press (Machine)')!.axial).toBeFalsy();
    expect(lookupExercise('Romanian Deadlift (Barbell)')!.pattern).toBe('hinge');
    expect(lookupExercise('Chest Supported Incline Row (Dumbbell)')!.axial).toBeFalsy();
    expect(lookupExercise('Неизвестное упражнение')).toBeNull();
    expect(lookupExercise('X', { X: { primary: ['calves'], secondary: [] } })!.primary).toEqual(['calves']);
  });
});

describe('Импорт замеров Hevy', () => {
  it('колонки по ключевым словам, талия важнее abdomen, левая сторона', () => {
    const r = parseHevyMeasurements(fx('hevy_measurements.csv'));
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({
      date: '2025-02-01',
      values: { weight: 82.4, neck: 39, shoulders: 121, chest: 101, waist: 84, hips: 98, forearm: 29, bicepsRelaxed: 35, thigh: 58, calf: 38 },
    });
  });
  it('не тот файл → ошибка', () => {
    expect(() => parseHevyMeasurements(fx('hevy_workouts.tsv'))).toThrow(FormatError);
  });
});
