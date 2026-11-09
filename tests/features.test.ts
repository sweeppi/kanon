import { describe, it, expect } from 'vitest';
import { buildIcs, defaultReminders } from '../src/lib/ics';
import { mapProduct } from '../src/lib/off';
import { deriveAll, plateauWeeks, streak, latestValues, goalMeasurements } from '../src/lib/derive';
import { buildAiContext } from '../src/lib/aiContext';
import { DEFAULT_SETTINGS, type Measurement } from '../src/lib/data/db';
import { addDays } from '../src/lib/calc/trend';
import { targetsFromValues } from '../src/lib/model/targets';

// Вымышленные данные, не пользователя
const ms: Measurement[] = [
  { date: '2026-10-01', weight: 82, height: 180, neck: 39, waist: 86, shoulders: 120, chest: 102, hips: 99, wrist: 17.5, ankle: 23, knee: 39, bicepsFlexed: 38, calf: 38, thigh: 58 },
  ...Array.from({ length: 27 }, (_, i) => ({ date: addDays('2026-10-02', i), weight: +(82 - 0.07 * (i + 1)).toFixed(2) })),
];

describe('Напоминания .ics', () => {
  it('валидный календарь с повторами', () => {
    const ics = buildIcs(defaultReminders('2026-11-10', 7), new Date('2026-11-09T10:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('RRULE:FREQ=DAILY');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1');
    expect(ics).toContain('DTSTART:20261110T071500');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(buildIcs(defaultReminders('2026-11-10', 3))).toContain('FREQ=DAILY;INTERVAL=3');
  });
});

describe('Open Food Facts', () => {
  it('нормализация продукта на 100 г', () => {
    const p = mapProduct({ code: '1', product_name: 'Творог 5%', brands: 'X', nutriments: { 'energy-kcal_100g': 121, proteins_100g: 17, fat_100g: 5, carbohydrates_100g: 1.8, fiber_100g: 0 } })!;
    expect(p.per100).toEqual({ kcal: 121, protein: 17, fat: 5, carbs: 1.8, fiber: 0, sugar: undefined });
    expect(mapProduct({ product_name: 'kJ only', nutriments: { energy_100g: 418.4, proteins_100g: 1 } })!.per100.kcal).toBe(100);
    expect(mapProduct({ product_name: '', nutriments: {} })).toBeNull();
  });
});

describe('Производные показатели', () => {
  const d = deriveAll(ms, [], [], DEFAULT_SETTINGS, [], '2026-10-28');
  it('последние значения переносятся вперёд', () => {
    expect(d.values.neck).toBe(39);
    expect(d.values.weight).toBeCloseTo(80.11, 2);
    expect(latestValues(ms, '2026-10-01').values.weight).toBe(82);
  });
  it('% жира, FFMI и темп', () => {
    expect(d.comp.bodyFatSource).toBe('navy');
    expect(d.comp.bodyFat).toBeGreaterThan(14);
    expect(d.comp.bodyFat).toBeLessThan(20);
    expect(d.ratePctPerWeek!).toBeLessThan(-0.5);
    expect(d.targets!.cutting).toBe(true);
  });
  it('плато: две недели почти без изменений', () => {
    const flat = Array.from({ length: 21 }, (_, i) => ({ date: addDays('2026-11-02', i), value: 80 + (i % 2) * 0.02 }));
    expect(plateauWeeks(flat)).toBe(2);
  });
  it('серия дней', () => {
    expect(streak(new Set(['2026-11-07', '2026-11-08', '2026-11-09']), '2026-11-09')).toBe(3);
    expect(streak(new Set(['2026-11-07', '2026-11-08']), '2026-11-09')).toBe(2);
    expect(streak(new Set(['2026-11-01']), '2026-11-09')).toBe(0);
  });
  it('цели для режима «Цель» и калибровки', () => {
    const g = goalMeasurements(d, DEFAULT_SETTINGS);
    expect(g.weight).toBe(70);
    expect(g.bicepsFlexed).toBeCloseTo(17.5 * 2.52, 6);
    const t = targetsFromValues({ bicepsFlexed: 40 }, 180);
    expect(t.biceps).toBeCloseTo(36.8, 6);
    expect(t.height).toBe(180);
  });
  it('контекст для ИИ: инструкция, данные и русские подписи', () => {
    const txt = buildAiContext({ days: 30, ms, sets: [], foods: [], settings: DEFAULT_SETTINGS, d });
    expect(txt).toContain('PMID или DOI');
    expect(txt).toContain('гиперлордоз');
    expect(txt).toContain('Вес, кг 82');
    expect(txt).toContain('ВОПРОС:');
  });
});
