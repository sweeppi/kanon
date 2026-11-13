// Свой каталог упражнений для генератора и для выбора в тренировке.
// Мышцы, тип движения и риск-теги здесь не дублируются: они берутся из общего справочника
// (lookupExercise), поэтому программа и аналитика считают объём одинаково. Тест проверяет, что каждое
// название распознаётся справочником именно так, как ожидает слот.
import type { Equipment, Pattern } from '../hevy/exercises';
import type { Gear } from './types';

/** Слот — «потребность» тренировочного дня; в слоте упражнения идут от предпочтительного к запасному. */
export type Slot =
  | 'hPush'
  | 'inclinePush'
  | 'fly'
  | 'vPush'
  | 'lateral'
  | 'vPull'
  | 'hPull'
  | 'hPull2'
  | 'rearDelt'
  | 'squat'
  | 'squat2'
  | 'hinge'
  | 'hinge2'
  | 'hamCurl'
  | 'legExt'
  | 'calves'
  | 'biceps'
  | 'triceps'
  | 'core';

export interface CatalogItem {
  name: string;
  /** чем выполняется — решает, доступно ли упражнение при выбранном оборудовании */
  equipment: Equipment;
}

export const SLOT_PATTERN: Record<Slot, Pattern> = {
  hPush: 'hPush',
  inclinePush: 'hPush',
  fly: 'isolation',
  vPush: 'vPush',
  lateral: 'isolation',
  vPull: 'vPull',
  hPull: 'hPull',
  hPull2: 'hPull',
  rearDelt: 'isolation',
  squat: 'squat',
  squat2: 'squat',
  hinge: 'hinge',
  hinge2: 'hinge',
  hamCurl: 'isolation',
  legExt: 'isolation',
  calves: 'isolation',
  biceps: 'isolation',
  triceps: 'isolation',
  core: 'core',
};

/** Многосуставные слоты: больше отдых и меньше повторов. */
export const COMPOUND: Slot[] = ['hPush', 'inclinePush', 'vPush', 'vPull', 'hPull', 'hPull2', 'squat', 'squat2', 'hinge', 'hinge2'];
/** Главные движения дня при цели «сила». */
export const MAIN_LIFTS: Slot[] = ['hPush', 'vPush', 'vPull', 'squat', 'hinge'];

const it = (name: string, equipment: Equipment): CatalogItem => ({ name, equipment });

export const CATALOG: Record<Slot, CatalogItem[]> = {
  hPush: [it('Жим штанги лёжа', 'barbell'), it('Жим гантелей лёжа', 'dumbbell'), it('Жим от груди в тренажёре', 'machine'), it('Отжимания от пола', 'bodyweight')],
  inclinePush: [it('Жим гантелей на наклонной скамье', 'dumbbell'), it('Жим штанги на наклонной скамье', 'barbell'), it('Отжимания от пола с ногами на опоре', 'bodyweight')],
  fly: [it('Сведения рук в тренажёре «бабочка»', 'machine'), it('Сведения рук в кроссовере', 'cable'), it('Разведения гантелей лёжа', 'dumbbell')],
  vPush: [it('Жим гантелей сидя', 'dumbbell'), it('Жим на плечи в тренажёре', 'machine'), it('Жим штанги стоя', 'barbell')],
  lateral: [it('Махи гантелями в стороны', 'dumbbell'), it('Махи в стороны на блоке', 'cable')],
  vPull: [it('Подтягивания', 'bodyweight'), it('Тяга верхнего блока к груди', 'cable')],
  hPull: [it('Тяга нижнего блока сидя', 'cable'), it('Тяга гантели одной рукой', 'dumbbell'), it('Тяга штанги в наклоне', 'barbell'), it('Тяга к поясу на низкой перекладине', 'bodyweight')],
  hPull2: [it('Тяга в тренажёре с упором грудью', 'machine'), it('Тяга гантелей с упором грудью в скамью', 'dumbbell'), it('Тяга нижнего блока сидя', 'cable'), it('Тяга к поясу на низкой перекладине', 'bodyweight')],
  rearDelt: [it('Тяга к лицу на блоке', 'cable'), it('Разведения гантелей в наклоне', 'dumbbell')],
  squat: [it('Приседания со штангой', 'barbell'), it('Жим ногами', 'machine'), it('Кубковые приседания с гантелью', 'dumbbell'), it('Выпады', 'bodyweight')],
  squat2: [it('Жим ногами', 'machine'), it('Гакк-приседания', 'machine'), it('Болгарские выпады с гантелями', 'dumbbell'), it('Зашагивания на опору', 'bodyweight')],
  hinge: [it('Румынская тяга со штангой', 'barbell'), it('Румынская тяга с гантелями', 'dumbbell'), it('Ягодичный мост со штангой', 'barbell'), it('Ягодичный мост', 'bodyweight')],
  hinge2: [it('Ягодичный мост со штангой', 'barbell'), it('Ягодичный мост с гантелью', 'dumbbell'), it('Гиперэкстензия', 'bodyweight'), it('Ягодичный мост', 'bodyweight')],
  hamCurl: [it('Сгибания ног в тренажёре', 'machine'), it('Нордические сгибания', 'bodyweight')],
  legExt: [it('Разгибания ног в тренажёре', 'machine')],
  calves: [it('Подъёмы на носки в тренажёре', 'machine'), it('Подъёмы на носки с гантелями', 'dumbbell'), it('Подъёмы на носки стоя', 'bodyweight')],
  biceps: [it('Сгибания рук с гантелями', 'dumbbell'), it('Сгибания рук на блоке', 'cable')],
  triceps: [it('Разгибания рук на блоке', 'cable'), it('Разгибания рук с гантелью лёжа', 'dumbbell')],
  core: [it('Планка', 'bodyweight'), it('Dead bug', 'bodyweight'), it('Боковая планка', 'bodyweight')],
};

/** Что считается доступным при выбранном оборудовании. */
export const GEAR_EQUIPMENT: Record<Gear, Equipment[]> = {
  gym: ['barbell', 'dumbbell', 'machine', 'cable', 'smith', 'bodyweight'],
  dumbbells: ['dumbbell', 'bodyweight'],
  bodyweight: ['bodyweight'],
};

/** Все названия каталога без повторов — для выбора упражнения в тренировке. */
export const CATALOG_NAMES: string[] = [...new Set(Object.values(CATALOG).flatMap((list) => list.map((x) => x.name)))].sort((a, b) => a.localeCompare(b, 'ru'));
