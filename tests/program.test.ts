// Генератор программ и «тренировка сейчас». Все данные вымышленные.
import { describe, it, expect } from 'vitest';
import { CATALOG, GEAR_EQUIPMENT, SLOT_PATTERN, type Slot } from '../src/lib/program/catalog';
import { generateProgram, weeklyVolume, weeklyFrequency, dayMinutes, flaggedInProgram, alternatives, MAJOR, VOLUME_MAX, VOLUME_MIN, PROGRAM_SOURCES } from '../src/lib/program/generate';
import { startWorkout, toWorkoutSets, lastResult, restRemaining, fmtClock, doneCount } from '../src/lib/program/session';
import { lookupExercise, detectEquipment } from '../src/lib/hevy/exercises';
import { HEALTH_FLAGS } from '../src/lib/health';
import { weeklySetsPerMuscle } from '../src/lib/hevy/training';
import type { GenParams, Gear } from '../src/lib/program/types';
import type { WorkoutSet } from '../src/lib/hevy/hevy';
import kb from '../src/lib/advice/knowledge.json';

const base: GenParams = { daysPerWeek: 4, gear: 'gym', goal: 'muscle', trainingYears: 3, minutes: 90, healthFlags: {}, priority: [] };

describe('Каталог упражнений', () => {
  it('каждое упражнение распознаётся справочником с типом движения своего слота', () => {
    for (const [slot, list] of Object.entries(CATALOG) as Array<[Slot, (typeof CATALOG)[Slot]]>) {
      for (const c of list) {
        const info = lookupExercise(c.name);
        expect(info, `не распознано: ${c.name}`).not.toBeNull();
        expect(info!.pattern, `${c.name}: тип движения`).toBe(SLOT_PATTERN[slot]);
        expect(info!.primary.length, `${c.name}: нет основной мышцы`).toBeGreaterThan(0);
      }
    }
  });

  it('оборудование из названия не противоречит каталогу', () => {
    for (const list of Object.values(CATALOG))
      for (const c of list) {
        const d = detectEquipment(c.name);
        if (d) expect(d, c.name).toBe(c.equipment);
      }
  });

  it('ожидаемые основные мышцы ключевых упражнений', () => {
    expect(lookupExercise('Жим штанги лёжа')!.primary).toContain('chest');
    expect(lookupExercise('Жим гантелей сидя')!.primary).toContain('shoulders');
    expect(lookupExercise('Тяга верхнего блока к груди')!.primary).toContain('back');
    expect(lookupExercise('Тяга нижнего блока сидя')!.primary).toContain('back');
    expect(lookupExercise('Жим ногами')!.primary).toContain('quads');
    expect(lookupExercise('Румынская тяга с гантелями')!.primary).toContain('hamstrings');
    expect(lookupExercise('Сгибания ног в тренажёре')!.primary).toEqual(['hamstrings']);
    expect(lookupExercise('Разгибания ног в тренажёре')!.primary).toEqual(['quads']);
    expect(lookupExercise('Разгибания рук на блоке')!.primary).toEqual(['triceps']);
    expect(lookupExercise('Сгибания рук с гантелями')!.primary).toEqual(['biceps']);
    expect(lookupExercise('Тяга к лицу на блоке')!.primary).toEqual(['rearDelts']);
    expect(lookupExercise('Махи гантелями в стороны')!.primary).toEqual(['shoulders']);
    expect(lookupExercise('Ягодичный мост со штангой')!.primary).toEqual(['glutes']);
  });
});

describe('Генератор программ', () => {
  it('число дней соответствует запросу, в дне нет повторов упражнений', () => {
    for (let d = 2; d <= 6; d++) {
      const p = generateProgram({ ...base, daysPerWeek: d });
      expect(p.days).toHaveLength(d);
      for (const day of p.days) {
        const names = day.exercises.map((e) => e.name);
        expect(new Set(names).size, `${d} дн., ${day.name}`).toBe(names.length);
        expect(day.exercises.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('одинаковые параметры дают одинаковую программу', () => {
    expect(generateProgram(base, 'x')).toEqual(generateProgram(base, 'x'));
  });

  it('зал, 3–6 дней: объём крупных мышц 10–20 подходов, частота не меньше 2 раз в неделю', () => {
    for (let d = 3; d <= 6; d++) {
      for (const years of [0.5, 2, 5]) {
        const p = generateProgram({ ...base, daysPerWeek: d, trainingYears: years });
        const v = weeklyVolume(p.days);
        const f = weeklyFrequency(p.days);
        for (const m of MAJOR) {
          expect(v[m] ?? 0, `${d} дн., стаж ${years}: ${m} объём`).toBeLessThanOrEqual(VOLUME_MAX);
          expect(f[m] ?? 0, `${d} дн., стаж ${years}: ${m} частота`).toBeGreaterThanOrEqual(2);
        }
        if (years >= 2) for (const m of MAJOR) expect(v[m] ?? 0, `${d} дн., стаж ${years}: ${m} объём`).toBeGreaterThanOrEqual(VOLUME_MIN);
      }
    }
  });

  it('объём выше 20 не бывает ни при каких параметрах, включая приоритет', () => {
    for (let d = 2; d <= 6; d++)
      for (const gear of ['gym', 'dumbbells', 'bodyweight'] as Gear[]) {
        const p = generateProgram({ ...base, daysPerWeek: d, gear, trainingYears: 8, minutes: 120, priority: ['chest', 'back'] });
        const v = weeklyVolume(p.days);
        for (const m of MAJOR) expect(v[m] ?? 0, `${d} дн., ${gear}: ${m}`).toBeLessThanOrEqual(VOLUME_MAX);
      }
  });

  it('если объём ниже 10 или частота ниже 2 — программа честно пишет об этом', () => {
    const p = generateProgram({ ...base, daysPerWeek: 2, trainingYears: 0.5, minutes: 45 });
    const v = weeklyVolume(p.days);
    const low = MAJOR.filter((m) => (v[m] ?? 0) < VOLUME_MIN);
    expect(low.length).toBeGreaterThan(0);
    expect(p.notes.some((n) => n.includes(`Меньше ${VOLUME_MIN} подходов`))).toBe(true);
  });

  it('оборудование: гантели и свой вес не получают тренажёров и штанги', () => {
    for (const gear of ['dumbbells', 'bodyweight'] as Gear[]) {
      const p = generateProgram({ ...base, gear });
      const allowed = GEAR_EQUIPMENT[gear];
      const all = Object.values(CATALOG).flat();
      for (const e of p.days.flatMap((d) => d.exercises)) {
        const item = all.find((c) => c.name === e.name)!;
        expect(allowed, `${gear}: ${e.name}`).toContain(item.equipment);
      }
    }
  });

  it('ограничения по здоровью: ни одного упражнения с отмеченным риском', () => {
    for (const f of HEALTH_FLAGS) {
      for (const gear of ['gym', 'dumbbells', 'bodyweight'] as Gear[]) {
        const flags = { [f.key]: true };
        const p = generateProgram({ ...base, gear, healthFlags: flags });
        expect(flaggedInProgram(p.days, flags), `${f.key}, ${gear}`).toEqual([]);
      }
    }
    const all = Object.fromEntries(HEALTH_FLAGS.map((f) => [f.key, true]));
    const p = generateProgram({ ...base, healthFlags: all });
    expect(flaggedInProgram(p.days, all)).toEqual([]);
    expect(p.notes.some((n) => n.includes('Пропущены'))).toBe(true);
  });

  it('гиперлордоз в зале: приседания со штангой заменены жимом ногами, румынская тяга — мостом', () => {
    const p = generateProgram({ ...base, healthFlags: { hyperlordosis: true } });
    const names = p.days.flatMap((d) => d.exercises.map((e) => e.name));
    expect(names).not.toContain('Приседания со штангой');
    expect(names).not.toContain('Румынская тяга со штангой');
    expect(names).toContain('Жим ногами');
    expect(names.some((n) => n.startsWith('Ягодичный мост'))).toBe(true);
  });

  it('цель «сила»: главные движения 3–6 повторов и отдых 180 с; давление: не меньше 8 повторов', () => {
    const s = generateProgram({ ...base, goal: 'strength' });
    const bench = s.days.flatMap((d) => d.exercises).find((e) => e.name === 'Жим штанги лёжа')!;
    expect([bench.repsMin, bench.repsMax, bench.restSec]).toEqual([3, 6, 180]);
    const h = generateProgram({ ...base, goal: 'strength', healthFlags: { hypertension: true } });
    for (const e of h.days.flatMap((d) => d.exercises)) expect(e.repsMin, e.name).toBeGreaterThanOrEqual(8);
  });

  it('цель «мышцы»: многосуставные отдыхают не меньше 2 минут, повторы в диапазоне 6–15', () => {
    const p = generateProgram(base);
    for (const e of p.days.flatMap((d) => d.exercises)) {
      expect(e.repsMin).toBeGreaterThanOrEqual(6);
      expect(e.repsMax).toBeLessThanOrEqual(15);
      const pat = lookupExercise(e.name)!.pattern;
      if (pat !== 'isolation' && pat !== 'core') expect(e.restSec, e.name).toBeGreaterThanOrEqual(120);
    }
  });

  it('ограничение по времени: день укладывается или сокращён до трёх упражнений', () => {
    const p = generateProgram({ ...base, minutes: 45 });
    for (const d of p.days) expect(dayMinutes(d) <= 45 || d.exercises.length === 3, d.name).toBe(true);
    expect(p.notes.some((n) => n.includes('45 минут'))).toBe(true);
  });

  it('приоритет добавляет объём выбранной мышце', () => {
    const a = weeklyVolume(generateProgram({ ...base, trainingYears: 1 }).days);
    const b = weeklyVolume(generateProgram({ ...base, trainingYears: 1, priority: ['shoulders'] }).days);
    expect(b.shoulders!).toBeGreaterThan(a.shoulders!);
  });

  it('замены: то же оборудование и ограничения, без самого упражнения', () => {
    const alt = alternatives('Приседания со штангой', { gear: 'gym', healthFlags: { hyperlordosis: true } });
    expect(alt).toContain('Жим ногами');
    expect(alt).not.toContain('Приседания со штангой');
    expect(alternatives('Жим штанги лёжа', { gear: 'dumbbells', healthFlags: {} })).toEqual(['Жим гантелей лёжа', 'Отжимания от пола']);
  });

  it('все источники генератора есть в проверяемой базе знаний', () => {
    for (const k of PROGRAM_SOURCES) expect((kb.sources as Record<string, { pmid: string }>)[k]?.pmid, k).toMatch(/^\d+$/);
  });
});

describe('Тренировка сейчас', () => {
  const history: WorkoutSet[] = [
    { key: 'a', start: '2025-03-01T18:00', end: null, title: 'Т', exercise: 'Жим штанги лёжа', occurrence: 0, setIndex: 0, setType: 'warmup', weightKg: 40, reps: 10, distanceKm: null, durationSec: null, rpe: null, notes: '', supersetId: '' },
    { key: 'b', start: '2025-03-01T18:00', end: null, title: 'Т', exercise: 'Жим штанги лёжа', occurrence: 0, setIndex: 1, setType: 'normal', weightKg: 80, reps: 8, distanceKm: null, durationSec: null, rpe: null, notes: '', supersetId: '' },
    { key: 'c', start: '2025-03-01T18:00', end: null, title: 'Т', exercise: 'Жим штанги лёжа', occurrence: 0, setIndex: 2, setType: 'normal', weightKg: 80, reps: 7, distanceKm: null, durationSec: null, rpe: null, notes: '', supersetId: '' },
    { key: 'd', start: '2025-02-20T18:00', end: null, title: 'Т', exercise: 'Жим штанги лёжа', occurrence: 0, setIndex: 0, setType: 'normal', weightKg: 75, reps: 8, distanceKm: null, durationSec: null, rpe: null, notes: '', supersetId: '' },
  ];

  it('прошлый результат: последняя тренировка, без разминки', () => {
    const r = lastResult(history, 'Жим штанги лёжа', '2025-03-05T10:00')!;
    expect(r.date).toBe('2025-03-01');
    expect(r.sets).toEqual([{ weightKg: 80, reps: 8 }, { weightKg: 80, reps: 7 }]);
    expect(lastResult(history, 'Жим штанги лёжа', '2025-03-01T18:00')!.date).toBe('2025-02-20');
    expect(lastResult(history, 'Планка', '2025-03-05T10:00')).toBeNull();
  });

  it('старт по дню программы: подходы по плану, вес из прошлого раза, повторы пустые', () => {
    const day = generateProgram(base).days[0];
    const w = startWorkout({ title: day.name, day, programId: 1, dayIndex: 0, history, now: new Date(2025, 2, 5, 19, 30) });
    expect(w.start).toBe('2025-03-05T19:30');
    expect(w.exercises).toHaveLength(day.exercises.length);
    const bench = w.exercises.find((e) => e.name === 'Жим штанги лёжа')!;
    expect(bench.sets).toHaveLength(day.exercises.find((e) => e.name === 'Жим штанги лёжа')!.sets);
    expect(bench.sets.every((s) => s.weightKg === 80 && s.reps === null && !s.done)).toBe(true);
    expect(doneCount(w)).toBe(0);
  });

  it('в журнал попадают только отмеченные подходы; ключи уникальны и совместимы с импортом', () => {
    const day = generateProgram(base).days[0];
    const w = startWorkout({ title: 'Верх 1', day, history: [], now: new Date(2025, 2, 5, 19, 30) });
    w.exercises[0].sets[0] = { weightKg: 82.5, reps: 8, done: true };
    w.exercises[0].sets[1] = { weightKg: 82.5, reps: 7, done: true };
    w.exercises[0].sets[2] = { weightKg: 82.5, reps: null, done: true }; // отмечен без повторов — не пишем
    w.exercises[1].sets[0] = { weightKg: 60, reps: 10, done: false }; // не отмечен
    const rows = toWorkoutSets(w, '2025-03-05T20:40');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ key: `2025-03-05T19:30|${w.exercises[0].name}|0|0`, start: '2025-03-05T19:30', end: '2025-03-05T20:40', title: 'Верх 1', setType: 'normal', weightKg: 82.5, reps: 8 });
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    // аналитика объёма видит эти подходы так же, как импортированные
    const vol = weeklySetsPerMuscle(rows);
    expect(Object.values(vol)[0]!.chest).toBe(2);
  });

  it('одно упражнение дважды за тренировку получает разные номера вхождения', () => {
    const w = startWorkout({ title: 'Свободная', history: [], now: new Date(2025, 2, 5, 19, 30) });
    const ex = { name: 'Планка', repsMin: 8, repsMax: 12, restSec: 60, sets: [{ weightKg: null, reps: 30, done: true }] };
    w.exercises.push(ex, structuredClone(ex));
    const rows = toWorkoutSets(w, '2025-03-05T20:00');
    expect(rows.map((r) => r.key)).toEqual(['2025-03-05T19:30|Планка|0|0', '2025-03-05T19:30|Планка|1|0']);
  });

  it('таймер отдыха считается от времени окончания и не уходит в минус', () => {
    expect(restRemaining(null, 1000)).toBe(0);
    expect(restRemaining(100_000, 10_000)).toBe(90);
    expect(restRemaining(100_000, 99_100)).toBe(1);
    expect(restRemaining(100_000, 250_000)).toBe(0); // вернулись из фона позже срока
    expect(fmtClock(150)).toBe('2:30');
    expect(fmtClock(5)).toBe('0:05');
  });
});
