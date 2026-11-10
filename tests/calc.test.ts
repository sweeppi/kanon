import { describe, it, expect } from 'vitest';
import {
  navyBodyFat,
  leanMass,
  ffmi,
  normalizedFfmi,
  waistToHeight,
  shoulderToWaist,
  reevesIdeal,
  reevesStatus,
  reevesScore,
  caseyButt,
} from '../src/lib/calc/body';
import { epley, brzycki, e1rm, dots } from '../src/lib/calc/strength';
import { mifflin, katchMcArdle, adaptiveTdee, cutDeficit, proteinTarget, forecastGoalDate, proteinPer100Rub } from '../src/lib/calc/nutrition';
import { ema, movingAverage, linearSlope, addDays, type Point } from '../src/lib/calc/trend';
import { computeLevel } from '../src/lib/calc/levels';
import { LEVELS, LEVELS_BY_SEX } from '../src/lib/calc/levels.config';
const ELITE = { score: 100, patterns: [] };

describe('% жира ВМС США', () => {
  it('мужчина 180 см, шея 38, талия 85 → 16.1 % (расчёт вручную)', () => {
    expect(navyBodyFat('male', 180, 38, 85)).toBeCloseTo(16.106, 2);
  });
  it('женщина 165 см, шея 32, талия 70, таз 95 → 24.9 %', () => {
    expect(navyBodyFat('female', 165, 32, 70, 95)).toBeCloseTo(24.86, 1);
  });
  it('невалидные входы → null', () => {
    expect(navyBodyFat('male', 180, 40, 38)).toBeNull();
    expect(navyBodyFat('female', 165, 32, 70)).toBeNull();
  });
});

describe('LBM, FFMI', () => {
  it('80 кг, 15 % → LBM 68; FFMI при 180 см = 20.99; нормализованный = FFMI (рост 1.8 м)', () => {
    const lbm = leanMass(80, 15);
    expect(lbm).toBeCloseTo(68, 6);
    expect(ffmi(lbm, 180)).toBeCloseTo(20.988, 3);
    expect(normalizedFfmi(lbm, 180)).toBeCloseTo(20.988, 3);
  });
  it('поправка на рост: 170 см, LBM 65 → FFMI 22.49, норм. 23.10', () => {
    expect(ffmi(65, 170)).toBeCloseTo(22.491, 3);
    expect(normalizedFfmi(65, 170)).toBeCloseTo(22.491 + 0.61, 3);
  });
});

describe('Отношения', () => {
  it('талия/рост и плечи/талия', () => {
    expect(waistToHeight(90, 180)).toBe(0.5);
    expect(shoulderToWaist(129.44, 80)).toBeCloseTo(1.618, 3);
  });
});

describe('Ривз (эвристика)', () => {
  it('идеалы по костям', () => {
    const r = reevesIdeal({ wrist: 17, ankle: 22, knee: 38, hips: 95 });
    expect(r.bicepsFlexed).toBeCloseTo(42.84, 2);
    expect(r.calf).toBeCloseTo(42.24, 2);
    expect(r.neck).toBeCloseTo((42.84 + 42.24) / 2, 2);
    expect(r.chest).toBeCloseTo(140.6, 1);
    expect(r.waist).toBeCloseTo(81.7, 1);
    expect(r.thigh).toBeCloseTo(66.5, 1);
  });
  it('статус: % выполнения и отставание, талия — «меньше лучше»', () => {
    const st = reevesStatus({ bicepsFlexed: 38.556, waist: 85 }, { bicepsFlexed: 42.84, waist: 81.7 });
    const arm = st.find((s) => s.key === 'bicepsFlexed')!;
    expect(arm.pct).toBeCloseTo(90, 1);
    expect(arm.gapCm).toBeCloseTo(4.284, 2);
    const waist = st.find((s) => s.key === 'waist')!;
    expect(waist.gapCm).toBeCloseTo(3.3, 1);
    expect(waist.pct).toBeLessThan(100);
    expect(reevesScore(st)).toBeGreaterThan(90);
    expect(st[0].key).toBe('bicepsFlexed'); // отсортировано от худшего
  });
});

describe('Casey Butt (эвристика)', () => {
  it('пример с исходной страницы: рост 6′2″, запястье 6.75″, 10 % жира → бицепс ≈ 16″', () => {
    const r = caseyButt(74 * 2.54, 6.75 * 2.54, 9 * 2.54, 10)!;
    expect(r.bicepsFlexed / 2.54).toBeCloseTo(16.1, 1);
    expect(r.maxLbmKg).toBeGreaterThan(70);
    expect(r.maxLbmKg).toBeLessThan(95);
  });
  it('нет входов → null', () => expect(caseyButt(180, 0, 22)).toBeNull());
});

describe('Силовые', () => {
  it('Epley и Brzycki на известных значениях', () => {
    expect(epley(100, 5)).toBeCloseTo(116.667, 3);
    expect(brzycki(100, 5)).toBeCloseTo(112.5, 3);
    expect(e1rm(100, 5)).toBeCloseTo(114.583, 3);
    expect(epley(100, 1)).toBe(100);
    expect(brzycki(100, 1)).toBe(100);
  });
  it('reps > 10 и некорректные входы → null', () => {
    expect(epley(100, 11)).toBeNull();
    expect(brzycki(100, 12)).toBeNull();
    expect(e1rm(0, 5)).toBeNull();
  });
  it('DOTS: 80 кг, сумма 500 → 344.77 (ручной расчёт по коэффициентам)', () => {
    expect(dots(500, 80, 'male')).toBeCloseTo(344.77, 1);
    expect(dots(500, 300, 'male')).toBeCloseTo(dots(500, 210, 'male')!, 6); // ограничение веса
  });
});

describe('Питание', () => {
  it('Mifflin–St Jeor и Katch–McArdle', () => {
    expect(mifflin('male', 80, 180, 18)).toBe(1840);
    expect(mifflin('female', 60, 165, 25)).toBeCloseTo(1345.25, 2);
    expect(katchMcArdle(64)).toBeCloseTo(1752.4, 6);
  });
  it('дефицит под темп 1 %/нед при 80 кг = 880 ккал/день', () => {
    expect(cutDeficit(80, 1)).toBeCloseTo(880, 6);
  });
  it('цели белка', () => {
    expect(proteinTarget(80, 68, false)).toMatchObject({ min: 128, max: 176 });
    const cut = proteinTarget(80, 68, true);
    expect(cut.min).toBeCloseTo(156.4, 6);
    expect(cut.max).toBeCloseTo(210.8, 6);
  });
  it('белок на 100 ₽', () => {
    expect(proteinPer100Rub(25, 50)).toBe(50);
    expect(proteinPer100Rub(25, 0)).toBeNull();
  });

  // синтетика: вес падает ровно на 0.1 кг/день, едим 2000 ккал → TDEE = 2000 + 0.1·7700 = 2770
  const start = '2025-01-01';
  const weights: Point[] = Array.from({ length: 28 }, (_, i) => ({ date: addDays(start, i), value: 80 - 0.1 * i }));
  const intake = Array.from({ length: 28 }, (_, i) => ({ date: addDays(start, i), kcal: 2000 }));

  it('адаптивный TDEE на синтетике ≈ 2770', () => {
    const r = adaptiveTdee(weights, intake, 21)!;
    expect(r).not.toBeNull();
    expect(r.tdee).toBeGreaterThan(2700);
    expect(r.tdee).toBeLessThan(2840);
    expect(r.trendKgPerWeek).toBeLessThan(-0.6);
  });
  it('адаптивный TDEE: мало данных → null', () => {
    expect(adaptiveTdee(weights.slice(0, 3), intake, 21)).toBeNull();
    expect(adaptiveTdee(weights, intake.slice(0, 5), 21)).toBeNull();
  });
  it('прогноз даты цели по тренду', () => {
    const f = forecastGoalDate(weights, 75)!;
    expect(f.date).not.toBeNull();
    expect(f.kgPerWeek).toBeLessThan(-0.6);
    expect(forecastGoalDate(weights, 90)!.date).toBeNull(); // тренд в другую сторону
  });
});

describe('Тренды', () => {
  const pts: Point[] = [
    { date: '2025-01-01', value: 80 },
    { date: '2025-01-02', value: 82 },
    { date: '2025-01-03', value: 81 },
  ];
  it('SMA-7', () => {
    expect(movingAverage(pts, 7).map((p) => p.value)).toEqual([80, 81, 81]);
  });
  it('EMA с учётом пропусков: α = 1 − e^(−Δt/τ)', () => {
    const e = ema(pts, 7);
    const a = 1 - Math.exp(-1 / 7);
    expect(e[1].value).toBeCloseTo(80 + a * 2, 6);
    const gap = ema([{ date: '2025-01-01', value: 80 }, { date: '2025-01-31', value: 70 }], 7);
    expect(gap[1].value).toBeLessThan(71); // после месяца пропуска тренд почти догнал
  });
  it('линейный наклон', () => {
    expect(linearSlope(pts)!.slope).toBeCloseTo(0.5, 6);
  });
});

describe('Уровни', () => {
  it('пороги уровней строго возрастают', () => {
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i].minScore).toBeGreaterThan(LEVELS[i - 1].minScore);
  });
  it('«Греческий бог» только у натурального потолка', () => {
    const god = computeLevel({
      normFfmi: 25,
      bodyFat: 9,
      shoulderWaist: 1.65,
      reevesPct: 98,
      strength: ELITE,
    });
    expect(god.level).toBe('Греческий бог');
    // высокий балл, но жир 13 % → не бог
    const almost = computeLevel({ normFfmi: 25, bodyFat: 13, shoulderWaist: 1.65, reevesPct: 98, strength: ELITE });
    expect(almost.level).not.toBe('Греческий бог');
    expect(almost.requirements.some((r) => /жир/i.test(r.text))).toBe(true);
  });
  it('типичный тренированный на сушке — средний уровень, есть подсказки и слабое звено', () => {
    const r = computeLevel({ normFfmi: 21.5, bodyFat: 16, shoulderWaist: 1.42, reevesPct: 88, strength: { score: 35, patterns: [{ label: 'Жим горизонтальный', exercise: 'Chest Press (Machine)', ratio: 1.05, std: [0.7, 1.7], score: 35 }] }, heightCm: 180, weightKg: 80, waistCm: 85, shouldersCm: 121 });
    expect(r.levelIndex).toBeGreaterThanOrEqual(2);
    expect(r.levelIndex).toBeLessThanOrEqual(5);
    expect(r.weakest).not.toBeNull();
    expect(r.requirements.length).toBeGreaterThan(0);
  });
  it('нет данных — «Старт», отсутствующие компоненты перечислены', () => {
    const r = computeLevel({});
    expect(r.level).toBe('Старт');
    expect(r.missing.length).toBe(5);
  });
  it('женская шкала: свои пороги и «Греческая богиня» только у потолка', () => {
    for (let i = 1; i < LEVELS_BY_SEX.female.length; i++) expect(LEVELS_BY_SEX.female[i].minScore).toBeGreaterThan(LEVELS_BY_SEX.female[i - 1].minScore);
    const goddess = computeLevel({ sex: 'female', normFfmi: 21, bodyFat: 19, shoulderWaist: 1.45, strength: ELITE });
    expect(goddess.level).toBe('Греческая богиня');
    expect(goddess.missing).not.toContain('reeves'); // Ривз для женщин не применяется
    const typical = computeLevel({ sex: 'female', normFfmi: 16.5, bodyFat: 27, shoulderWaist: 1.3 });
    expect(typical.levelIndex).toBeGreaterThanOrEqual(2);
    expect(typical.levelIndex).toBeLessThanOrEqual(4);
    // мужские цифры у женщины не дают «бога»: те же 25 FFMI считаются, но жир 9 % ниже минимума 16
    expect(computeLevel({ sex: 'female', normFfmi: 25, bodyFat: 9, shoulderWaist: 1.6, strength: ELITE }).level).not.toBe('Греческая богиня');
  });
  it('подсказки по силе называют конкретное упражнение', () => {
    const r = computeLevel({ normFfmi: 25, bodyFat: 9, shoulderWaist: 1.65, reevesPct: 98, weightKg: 80, strength: { score: 60, patterns: [{ label: 'Присед / жим ногами', exercise: 'Leg Press (Machine)', ratio: 2.5, std: [1.5, 4], score: 40 }] } });
    expect(r.requirements.some((x) => x.text.includes('Leg Press'))).toBe(true);
  });
});
