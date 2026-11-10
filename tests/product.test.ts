// Тесты «продуктовых» функций: распознавание упражнений, ограничения по здоровью, универсальный импорт,
// оценка клетчатки/сахара, калькулятор активности. Все данные вымышленные.
import { describe, it, expect } from 'vitest';
import { lookupExercise, detectEquipment, strengthStandard, type Muscle } from '../src/lib/hevy/exercises';
import { patternStrength } from '../src/lib/hevy/training';
import { flagsForTags, HEALTH_FLAGS } from '../src/lib/health';
import { readTable } from '../src/lib/import/table';
import { detectWorkouts, parseWorkoutTable } from '../src/lib/import/workouts';
import { detectMeasurements, parseMeasurementTable } from '../src/lib/import/measurements';
import { detectFoods, parseFoodTable, foodKey } from '../src/lib/import/foods';
import { estimateFiberSugar } from '../src/lib/calc/foodEstimate';
import { activityTdee } from '../src/lib/calc/activity';
import { mifflin } from '../src/lib/calc/nutrition';

describe('Распознавание упражнений', () => {
  const cases: Array<[string, Muscle]> = [
    ['Butterfly (Pec Deck)', 'chest'],
    ['Бабочка', 'chest'],
    ['Сведение рук в тренажёре', 'chest'],
    ['Cable Fly Crossovers', 'chest'],
    ['Chest Press (Machine)', 'chest'],
    ['Жим в тренажёре сидя', 'chest'],
    ['Iso-Lateral Chest Press (Machine)', 'chest'],
    ['Incline Chest Press (Machine)', 'chest'],
    ['Жим гантелей лёжа', 'chest'],
    ['Жим штанги на наклонной скамье', 'chest'],
    ['Seated Cable Row - V Grip (Cable)', 'back'],
    ['Тяга горизонтального блока', 'back'],
    ['Lat Pulldown (Cable)', 'back'],
    ['Тяга верхнего блока к груди', 'back'],
    ['Iso-Lateral Row (Machine)', 'back'],
    ['T Bar Row', 'back'],
    ['Chest Supported Incline Row (Dumbbell)', 'back'],
    ['Подтягивания', 'back'],
    ['Rear Delt Reverse Fly (Machine)', 'rearDelts'],
    ['Face Pull (Cable)', 'rearDelts'],
    ['Разведение гантелей в наклоне', 'rearDelts'],
    ['Lateral Raise (Cable)', 'shoulders'],
    ['Махи гантелями в стороны', 'shoulders'],
    ['Shoulder Press (Machine)', 'shoulders'],
    ['Жим гантелей сидя', 'shoulders'],
    ['Preacher Curl (Machine)', 'biceps'],
    ['Сгибание рук на скамье Скотта', 'biceps'],
    ['Hammer Curl (Dumbbell)', 'biceps'],
    ['Triceps Pushdown (Cable)', 'triceps'],
    ['Французский жим', 'triceps'],
    ['Triceps Kickback (Dumbbell)', 'triceps'],
    ['Close Grip Bench Press', 'triceps'],
    ['Leg Extension (Machine)', 'quads'],
    ['Разгибание ног в тренажёре', 'quads'],
    ['Seated Leg Curl (Machine)', 'hamstrings'],
    ['Сгибание ног лёжа', 'hamstrings'],
    ['Leg Press (Machine)', 'quads'],
    ['Жим ногами в тренажёре', 'quads'],
    ['Hack Squat (Machine)', 'quads'],
    ['Pendulum Squat (Machine)', 'quads'],
    ['Bulgarian Split Squat', 'quads'],
    ['Hip Thrust (Machine)', 'glutes'],
    ['Glute Kickback (Machine)', 'glutes'],
    ['Hip Abduction (Machine)', 'glutes'],
    ['Hip Adduction (Machine)', 'adductors'],
    ['Сведение ног в тренажёре', 'adductors'],
    ['Romanian Deadlift (Dumbbell)', 'hamstrings'],
    ['Румынская тяга', 'hamstrings'],
    ['Seated Calf Raise', 'calves'],
    ['Calf Press on Leg Press', 'calves'],
    ['Back Extension (Hyperextension)', 'lowerBack'],
    ['Cable Crunch', 'abs'],
    ['Plank', 'abs'],
    ['Shrug (Dumbbell)', 'traps'],
    ['Pullover (Machine)', 'back'],
  ];
  it.each(cases)('%s → %s', (name, muscle) => {
    const info = lookupExercise(name);
    expect(info, name).not.toBeNull();
    expect(info!.primary, name).toContain(muscle);
  });
  it('Incline Curl не считается грудью', () => {
    expect(lookupExercise('Incline Curl (Dumbbell)')!.primary).toContain('biceps');
  });
  it('оборудование', () => {
    expect(detectEquipment('Chest Press (Machine)')).toBe('machine');
    expect(detectEquipment('Bench Press (Barbell)')).toBe('barbell');
    expect(detectEquipment('Жим гантелей лёжа')).toBe('dumbbell');
    expect(detectEquipment('Seated Row (Cable)')).toBe('cable');
    expect(detectEquipment('Squat (Smith Machine)')).toBe('smith');
  });
  it('риск-теги: тренажёры снимают осевую нагрузку, Смит — нет', () => {
    expect(lookupExercise('Squat (Barbell)')!.tags).toContain('axial');
    expect(lookupExercise('Hack Squat (Machine)')!.tags).not.toContain('axial');
    expect(lookupExercise('Squat (Smith Machine)')!.tags).toContain('axial');
    expect(lookupExercise('Shoulder Press (Machine)')!.tags).toContain('overhead');
    expect(lookupExercise('Upright Row (Barbell)')!.tags).toContain('shoulderImpingement');
    expect(lookupExercise('Leg Extension (Machine)')!.tags).toContain('kneeShear');
    expect(lookupExercise('Cable Crunch')!.tags).toContain('spinalFlexion');
    expect(lookupExercise('Back Extension (Hyperextension)')!.tags).toContain('lumbarExtension');
  });
  it('стандарты силы для тренажёров и гантелей', () => {
    expect(strengthStandard('Chest Press (Machine)', lookupExercise('Chest Press (Machine)'))).toEqual([0.7, 1.7]);
    expect(strengthStandard('Leg Press (Machine)', lookupExercise('Leg Press (Machine)'))).toEqual([1.5, 4.0]);
    expect(strengthStandard('Bench Press (Dumbbell)', lookupExercise('Bench Press (Dumbbell)'))).toEqual([0.3, 0.75]);
    expect(strengthStandard('Lateral Raise (Dumbbell)', lookupExercise('Lateral Raise (Dumbbell)'))).toBeNull();
  });
  it('ключевые движения на одних тренажёрах', () => {
    const mk = (exercise: string, weightKg: number, reps: number) => ({
      key: exercise, start: '2026-11-02T08:00', end: null, title: 'T', exercise, occurrence: 0, setIndex: 0, setType: 'normal', weightKg, reps, distanceKm: null, durationSec: null, rpe: null, notes: '', supersetId: '',
    });
    const p = patternStrength([mk('Chest Press (Machine)', 90, 8), mk('Leg Press (Machine)', 220, 10), mk('Lat Pulldown (Cable)', 70, 10), mk('Seated Row (Machine)', 75, 10)], 80);
    expect(p.hPush?.exercise).toBe('Chest Press (Machine)');
    expect(p.squat?.exercise).toBe('Leg Press (Machine)');
    expect(p.vPull?.exercise).toBe('Lat Pulldown (Cable)');
    expect(p.hPull?.exercise).toBe('Seated Row (Machine)');
    const f = patternStrength([mk('Chest Press (Machine)', 90, 8)], 80, 'female');
    expect(f.hPush!.score).toBeGreaterThan(p.hPush!.score); // женские ориентиры ниже
  });
});

describe('Ограничения по здоровью', () => {
  it('10 флагов, у каждого есть теги и советы', () => {
    expect(HEALTH_FLAGS).toHaveLength(10);
    for (const f of HEALTH_FLAGS) {
      expect(f.tags.length).toBeGreaterThan(0);
      expect(f.advice.length).toBeGreaterThan(0);
    }
  });
  it('колено: гакк помечается, тяга верхнего блока — нет', () => {
    const flags = { knee: true };
    expect(flagsForTags(lookupExercise('Hack Squat (Machine)')!.tags, flags).map((f) => f.key)).toEqual(['knee']);
    expect(flagsForTags(lookupExercise('Lat Pulldown (Cable)')!.tags, flags)).toEqual([]);
  });
  it('плечо + давление: жим стоя попадает под оба', () => {
    const keys = flagsForTags(lookupExercise('Overhead Press (Barbell)')!.tags, { shoulder: true, hypertension: true }).map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['shoulder', 'hypertension']));
  });
});

describe('Универсальный импорт тренировок', () => {
  it('Strong-подобный файл: «;», разминка «W», единица из выбора', () => {
    const csv = [
      'Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE',
      '2026-11-02 08:00:00;Push;1h;Bench Press (Barbell);W;60;10;0;0;;;',
      '2026-11-02 08:00:00;Push;1h;Bench Press (Barbell);1;100;5;0;0;;;8',
      '2026-11-02 08:00:00;Push;1h;Bench Press (Barbell);2;100;5;0;0;;;',
    ].join('\n');
    const t = readTable(csv);
    const d = detectWorkouts(t);
    expect(d.source).toBe('strong');
    const r = parseWorkoutTable(t, csv, d, { unit: 'lbs' });
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0].setType).toBe('warmup');
    expect(r.rows[1].weightKg).toBeCloseTo(45.36, 2); // 100 lb
    expect(r.rows[1].rpe).toBe(8);
    expect(new Set(r.rows.map((x) => x.key)).size).toBe(3);
  });
  it('FitNotes-подобный файл: дата без времени, кг из заголовка', () => {
    const csv = ['Date,Exercise,Category,Weight (kgs),Reps,Distance,Distance Unit,Time', '2026-11-03,Leg Press,Legs,200,10,,,', '2026-11-03,Leg Press,Legs,200,9,,,'].join('\n');
    const t = readTable(csv);
    const d = detectWorkouts(t);
    expect(d.source).toBe('fitnotes');
    expect(d.unitKnown).toBe('kg');
    const r = parseWorkoutTable(t, csv, d, { unit: 'lbs' });
    expect(r.rows.map((x) => x.setIndex)).toEqual([0, 1]); // номер подхода по порядку
    expect(r.rows[0].weightKg).toBe(200);
    expect(r.warnings.join(' ')).toMatch(/нет времени/);
  });
  it('своя русская таблица из Excel', () => {
    const csv = ['Дата;Упражнение;Вес, кг;Повторы;Подход', '05.11.2026;Бабочка;45;12;1', '05.11.2026;Бабочка;45;11;2'].join('\n');
    const t = readTable(csv);
    const d = detectWorkouts(t);
    expect(d.source).toBe('generic');
    const r = parseWorkoutTable(t, csv, d, { unit: 'kg' });
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].exercise).toBe('Бабочка');
    expect(r.rows[1].reps).toBe(11);
  });
  it('нет обязательной колонки — понятная ошибка', () => {
    const csv = 'Дата;Вес\n05.11.2026;80';
    const t = readTable(csv);
    expect(() => parseWorkoutTable(t, csv, detectWorkouts(t), { unit: 'kg' })).toThrow(/Укажите колонки/);
  });
  it('Hevy по-прежнему разбирается проверенным парсером (ключи совместимы)', () => {
    const csv = ['"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"', '"A","3 Feb 2025, 08:00","","","Bench Press (Barbell)","","","0","normal","80","5","","",""'].join('\n');
    const t = readTable(csv);
    const d = detectWorkouts(t);
    expect(d.source).toBe('hevy');
    expect(parseWorkoutTable(t, csv, d, { unit: 'kg' }).rows[0].key).toBe('2025-02-03T08:00|Bench Press (Barbell)|0|0');
  });
});

describe('Универсальный импорт замеров', () => {
  it('умные весы: время, вес, % жира', () => {
    const csv = ['time,weight,bmi,fatRate,muscleRate', '2026-11-01 07:10:00,80.4,24.8,17.2,40', '2026-11-01 21:00:00,81.0,25,17.5,40', '2026-11-02 07:05:00,80.1,24.7,17.0,40'].join('\n');
    const t = readTable(csv);
    const r = parseMeasurementTable(t, detectMeasurements(t));
    expect(r.rows).toHaveLength(2); // два замера за 01.11 → один день (последний)
    expect(r.rows[0].values.weight).toBe(81);
    expect(r.rows[1].values.bodyFatInput).toBe(17);
  });
  it('дюймы и фунты пересчитываются, правая сторона пропускается', () => {
    const csv = ['Date,Weight (lbs),Waist (in),Right Bicep (in),Left Bicep (in)', '2026-11-05,176.37,33,15,14.5'].join('\n');
    const t = readTable(csv);
    const r = parseMeasurementTable(t, detectMeasurements(t));
    expect(r.rows[0].values.weight).toBeCloseTo(80, 1);
    expect(r.rows[0].values.waist).toBeCloseTo(83.8, 1);
    expect(r.rows[0].values.bicepsRelaxed).toBeCloseTo(36.8, 1); // левая 14.5″
  });
});

describe('Импорт питания', () => {
  it('MyFitnessPal-подобный: приём пищи, клетчатка есть, сахар оценивается', () => {
    const csv = ['Date,Meal,Calories,Fat (g),Saturated Fat,Carbohydrates (g),Fiber,Protein (g)', '2026-11-05,Breakfast,450,12,4,60,8,25', '2026-11-05,Lunch,700,20,6,70,,50'].join('\n');
    const t = readTable(csv);
    const m = detectFoods(t);
    const r = parseFoodTable(t, m);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].fat).toBe(12); // не «Saturated Fat»
    expect(r.rows[0].fiber).toBe(8);
    expect(r.rows[0].fiberEstimated).toBeUndefined();
    expect(r.rows[1].fiberEstimated).toBe(true);
    expect(r.rows[0].sugarEstimated).toBe(true);
  });
  it('Cronometer-подобный с кДж вместо ккал и русская таблица', () => {
    const csv = ['Day,Food Name,Amount,Energy (kJ),Protein (g),Fat (g),Carbs (g)', '2026-11-05,Oats,60 g,920,8,4,36'].join('\n');
    const t = readTable(csv);
    const r = parseFoodTable(t, detectFoods(t));
    expect(r.rows[0].kcal).toBe(220);
    expect(r.rows[0].fiber).toBeGreaterThan(4); // овсянка — цельная крупа
    const ru = 'Дата;Продукт;Ккал;Белки;Жиры;Углеводы\n06.11.2026;Творог 5%;121;17;5;1,8';
    const t2 = readTable(ru);
    const r2 = parseFoodTable(t2, detectFoods(t2));
    expect(r2.rows[0]).toMatchObject({ date: '2026-11-06', name: 'Творог 5%', kcal: 121, protein: 17, fiber: 0 });
    expect(foodKey(r2.rows[0])).toBe(foodKey({ ...r2.rows[0] })); // стабильный ключ дубля
  });
});

describe('Оценка клетчатки и сахара', () => {
  it('по категории продукта', () => {
    expect(estimateFiberSugar('Брокколи', 10).fiber).toBeCloseTo(3.5, 6);
    expect(estimateFiberSugar('Банан', 20).sugar).toBeCloseTo(15, 6);
    expect(estimateFiberSugar('Куриная грудка', 0).fiber).toBe(0);
    expect(estimateFiberSugar('Творог', 3).sugar).toBeCloseTo(2.7, 6);
    const given = estimateFiberSugar('Гречка', 60, 6, 1);
    expect(given).toMatchObject({ fiber: 6, sugar: 1, fiberEstimated: false, sugarEstimated: false });
  });
});

describe('Калькулятор активности', () => {
  it('пример: 80 кг, 180 см, 18 лет, 17 000 шагов, 3.5 тренировки, 20 ч на ногах', () => {
    const bmr = mifflin('male', 80, 180, 18);
    const a = activityTdee(bmr, 80, { stepsPerDay: 17000, trainingsPerWeek: 3.5, trainingMinutes: 60, trainingIntensity: 'moderate', standingHoursPerWeek: 20 });
    expect(a.walking).toBeCloseTo(433.3, 0); // 13 000 шагов ≈ 130 мин × 2.5 MET × 80 кг
    expect(a.training).toBeCloseTo(100, 0);
    expect(a.standing).toBeCloseTo(160, 0);
    expect(a.factor).toBeGreaterThan(1.55);
    expect(a.factor).toBeLessThan(1.65);
  });
  it('сидячий день без тренировок ≈ ×1.2', () => {
    const a = activityTdee(1800, 70, { stepsPerDay: 3000, trainingsPerWeek: 0, trainingMinutes: 0, trainingIntensity: 'moderate', standingHoursPerWeek: 0 });
    expect(a.factor).toBeCloseTo(1.2, 6);
  });
});

describe('Замеры на русском', () => {
  it('правая сторона пропускается и в русских заголовках', () => {
    const csv = ['Дата;Вес;Правая рука;Левая рука;Талия', '05.11.2026;80;37;36,5;83'].join('\n');
    const t = readTable(csv);
    const r = parseMeasurementTable(t, detectMeasurements(t));
    expect(r.rows[0].values).toMatchObject({ weight: 80, bicepsRelaxed: 36.5, waist: 83 });
  });
});

describe('Оценка для смешанных блюд', () => {
  it('курица с рисом — углеводы от риса, а не «мясо»', () => {
    const r = estimateFiberSugar('Куриная грудка с рисом', 75);
    expect(r.category).toBe('крупы/макароны');
    expect(r.sugar).toBeLessThan(3);
    expect(estimateFiberSugar('Овсянка на молоке', 50).category).toBe('цельные крупы');
  });
});
