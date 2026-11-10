// Прогноз тела, мини-отчёт и «рельеф» модели. Данные вымышленные.
import { describe, it, expect } from 'vitest';
import { forecastAt, lbmCeiling, monthsToShare, leanRatePerYear, type ForecastBase } from '../src/lib/calc/forecast';
import { caseyButt } from '../src/lib/calc/body';
import { globalsFromComposition } from '../src/lib/model/calibrate';
import { buildReport, reportText } from '../src/lib/report';
import { deriveAll } from '../src/lib/derive';
import { DEFAULT_SETTINGS, type Settings, type Measurement } from '../src/lib/data/db';

const base: ForecastBase = {
  sex: 'male',
  heightCm: 180,
  weight: 80,
  bodyFat: 16,
  values: { weight: 80, neck: 39, shoulders: 119, chest: 102, waist: 84, hips: 99, bicepsFlexed: 38, forearm: 30, thigh: 58, calf: 38, wrist: 17.5, ankle: 23 },
  trainingYears: 5,
  goalBodyFat: 11,
  cutRatePct: 0.7,
  butt: caseyButt(180, 17.5, 23, 10),
  style: 'max',
};
const aest: ForecastBase = { ...base, style: 'aesthetic' };

describe('Прогноз тела', () => {
  it('сухая масса растёт с реальной скоростью и упирается в потолок', () => {
    const now = forecastAt(base, 0);
    const y1 = forecastAt(base, 12);
    const ceil = forecastAt(base, 'ceiling');
    expect(now.lbm).toBeCloseTo(67.2, 1);
    expect(y1.lbm - now.lbm).toBeGreaterThan(1.2); // ≈ 1,75 кг/год у стажа 5 лет, чуть меньше из-за замедления
    expect(y1.lbm - now.lbm).toBeLessThan(1.8);
    expect(ceil.lbm).toBeCloseTo(lbmCeiling(base), 6);
    expect(ceil.normFfmi).toBeGreaterThan(23);
    expect(y1.toCeiling).toBeGreaterThan(0);
    expect(y1.toCeiling).toBeLessThan(0.3);
  });
  it('жир уходит к цели, талия уменьшается, руки растут к потенциалу', () => {
    const y1 = forecastAt(base, 12);
    expect(y1.bodyFat).toBeLessThan(12);
    expect(y1.values.waist!).toBeLessThan(84);
    const ceil = forecastAt(base, 'ceiling');
    expect(ceil.values.bicepsFlexed!).toBeCloseTo(base.butt!.bicepsFlexed, 0);
    expect(ceil.values.chest!).toBeGreaterThan(102);
  });
  it('скорость по стажу и полу; время до половины пути', () => {
    expect(leanRatePerYear(5, 'male')).toBeCloseTo(1.75, 6);
    expect(leanRatePerYear(0.5, 'female')).toBeCloseTo(3.5, 6);
    const half = monthsToShare(base, 0.5)!;
    expect(half).toBeGreaterThan(24);
    expect(forecastAt(base, half).toCeiling).toBeCloseTo(0.5, 2);
  });
});

describe('Стиль «Эстетика» (фитнес-модель)', () => {
  it('цель FFMI 23, жир ≤ 10 %, узкая талия, V-силуэт, ноги растут умеренно', () => {
    const c = forecastAt(aest, 'ceiling');
    expect(c.normFfmi).toBeCloseTo(23, 1);
    expect(c.bodyFat).toBeLessThanOrEqual(10.01);
    expect(c.values.waist!).toBeLessThan(80); // талия уменьшается за счёт реально сброшенного жира, не уже 0,43 × рост
    expect(c.values.waist!).toBeGreaterThanOrEqual(0.43 * 180);
    expect(c.values.shoulders! / c.values.waist!).toBeGreaterThan(1.55);
    const m = forecastAt(base, 'ceiling');
    expect(c.values.thigh!).toBeLessThan(m.values.thigh!); // ноги меньше, чем в «максимуме»
    expect(c.weight).toBeLessThan(m.weight);
  });
  it('по умолчанию стиль — эстетика', () => {
    const { style: _s, ...noStyle } = base;
    expect(forecastAt(noStyle, 'ceiling').normFfmi).toBeCloseTo(23, 1);
  });
});

describe('Мышечность и рельеф модели из состава тела', () => {
  it('у натурального потолка модель заметно накачаннее обычной', () => {
    const avg = globalsFromComposition(20, 18);
    const top = globalsFromComposition(25, 9);
    expect(top.muscle!).toBeCloseTo(0.55, 6); // общий морф ограничен — иначе трапеции и таз как у культуриста
    expect(top.definition!).toBeCloseTo(1, 6);
    expect(avg.definition!).toBeLessThan(0.15);
    expect(top.fat!).toBeLessThan(0);
  });
});

describe('Мини-отчёт', () => {
  const ms: Measurement[] = [
    { date: '2026-11-01', weight: 80, height: 180, neck: 39, shoulders: 119, chest: 102, waist: 84, hips: 99, bicepsFlexed: 36, forearm: 30, thigh: 58, calf: 38, wrist: 17.5, ankle: 23, knee: 39 },
  ];
  const S: Settings = { ...DEFAULT_SETTINGS, sex: 'male', age: 18, heightCm: 180, goalWeightKg: 72, goalBodyFat: 11, trainingYears: 5, healthFlags: { knee: true } };
  const d = deriveAll(ms, [], [], S, [], '2026-11-02');
  const r = buildReport(d, S);
  it('зоны отсортированы от отстающей, у каждой цель и подходы', () => {
    expect(r.zones.length).toBeGreaterThan(4);
    for (let i = 1; i < r.zones.length; i++) expect(r.zones[i].pct).toBeGreaterThanOrEqual(r.zones[i - 1].pct);
    expect(r.zones[0].sets).toMatch(/14–20/);
    expect(r.zones.find((z) => z.zone === 'shoulders')!.basis).toMatch(/1,618/);
  });
  it('упражнения фильтруются по ограничениям (колено — без жима ногами и гакка)', () => {
    const squat = r.strength.find((p) => p.pattern === 'squat')!;
    expect(squat.exercises.join(' ')).not.toMatch(/Жим ногами|Гакк/);
    expect(squat.exercises).toContain('Присед с поясом (belt squat)');
    // в эстетике бёдра 58 см уже не приоритет — цели берутся из модели «Эстетика»
    expect(r.zones.every((z) => z.basis === 'эстетическая цель' || z.zone === 'shoulders')).toBe(true);
  });
  it('прогноз и текст отчёта', () => {
    expect(r.forecast).not.toBeNull();
    const txt = reportText(r);
    expect(txt).toContain('МИНИ-ОТЧЁТ');
    expect(txt).toContain('ЭСТЕТИКА');
    expect(txt).toContain('ПРОГНОЗ');
  });
});
