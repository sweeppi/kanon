// Конфигурация уровней прокачки. Обоснование весов и порогов — README («Уровни»).
// Всё здесь — эвристика автора приложения с ориентирами из исследований (FFMI — Kouri 1995,
// темп сушки — Helms 2014 / Garthe 2011). Женские пороги — более грубая эвристика: данных меньше.
// Править можно свободно: тесты проверяют монотонность и «бога только у потолка».

export type Sex = 'male' | 'female';

export const COMPONENT_WEIGHTS = {
  ffmi: 0.3, // мышечная масса с поправкой на рост
  bodyFat: 0.2, // рельеф и здоровье
  shoulderWaist: 0.15, // V-силуэт
  reeves: 0.15, // гармония пропорций (только для мужчин — эвристика Ривза мужская)
  strength: 0.2, // относительная сила по паттернам движений (штанга, гантели, тренажёры)
} as const;
export type Component = keyof typeof COMPONENT_WEIGHTS;

/** Линейная нормализация в 0–100: [значение при 0 баллов, значение при 100 баллах]. */
export const NORMALIZE: Record<Sex, { ffmi: [number, number]; bodyFat: [number, number]; bodyFatFloor: number; shoulderWaist: [number, number]; reeves: [number, number] | null }> = {
  // 18 ≈ нетренированный мужчина, 25 ≈ натуральный потолок (Kouri 1995); жир ниже 6 % не поощряется
  male: { ffmi: [18, 25], bodyFat: [25, 10], bodyFatFloor: 6, shoulderWaist: [1.2, 1.618], reeves: [75, 100] },
  // эвристика: типичный FFMI женщин ≈ 14–16, натуральные атлетки редко выше ≈ 21–22; жир ниже 14 % не поощряется
  female: { ffmi: [14, 21], bodyFat: [35, 18], bodyFatFloor: 14, shoulderWaist: [1.1, 1.45], reeves: null },
};

export interface Gate {
  ffmiMin?: number;
  bodyFatMax?: number;
  bodyFatMin?: number;
  shoulderWaistMin?: number;
  reevesMin?: number;
  strengthScoreMin?: number;
}

export interface LevelDef {
  name: string;
  minScore: number;
  gate?: Gate;
  blurb: string;
}

const MALE: LevelDef[] = [
  { name: 'Старт', minScore: 0, blurb: 'Точка отсчёта. Важно начать измерять.' },
  { name: 'Новичок', minScore: 15, blurb: 'Первые адаптации, база техники.' },
  { name: 'Любитель', minScore: 28, blurb: 'Регулярные тренировки дают заметный результат.' },
  { name: 'Атлет', minScore: 40, gate: { ffmiMin: 20 }, blurb: 'Тренированное тело выше среднего.' },
  { name: 'Продвинутый', minScore: 52, gate: { ffmiMin: 21, bodyFatMax: 18 }, blurb: 'Годы стажа видны без футболки.' },
  { name: 'Эстет', minScore: 64, gate: { ffmiMin: 22, bodyFatMax: 15, shoulderWaistMin: 1.4 }, blurb: 'Рельеф и V-силуэт.' },
  { name: 'Элита', minScore: 76, gate: { ffmiMin: 23, bodyFatMax: 13, shoulderWaistMin: 1.5 }, blurb: 'Уровень соревнующегося натурала.' },
  { name: 'Полубог', minScore: 87, gate: { ffmiMin: 24, bodyFatMax: 12, shoulderWaistMin: 1.55, reevesMin: 90 }, blurb: 'Около натурального потолка.' },
  {
    name: 'Греческий бог',
    minScore: 95,
    gate: { ffmiMin: 24.5, bodyFatMin: 8, bodyFatMax: 11, shoulderWaistMin: 1.6, reevesMin: 95, strengthScoreMin: 90 },
    blurb: 'Натуральный потолок: FFMI ≈ 25, жир 8–11 %, плечи/талия ≥ 1.6, пропорции Ривза ≥ 95 %, элитная сила.',
  },
];

const FEMALE: LevelDef[] = [
  { name: 'Старт', minScore: 0, blurb: 'Точка отсчёта. Важно начать измерять.' },
  { name: 'Новичок', minScore: 15, blurb: 'Первые адаптации, база техники.' },
  { name: 'Любитель', minScore: 28, blurb: 'Регулярные тренировки дают заметный результат.' },
  { name: 'Атлет', minScore: 40, gate: { ffmiMin: 16 }, blurb: 'Тренированное тело выше среднего.' },
  { name: 'Продвинутый уровень', minScore: 52, gate: { ffmiMin: 17, bodyFatMax: 28 }, blurb: 'Годы стажа заметны.' },
  { name: 'Эстет', minScore: 64, gate: { ffmiMin: 18, bodyFatMax: 25, shoulderWaistMin: 1.3 }, blurb: 'Рельеф и силуэт.' },
  { name: 'Элита', minScore: 76, gate: { ffmiMin: 19, bodyFatMax: 23, shoulderWaistMin: 1.35 }, blurb: 'Уровень соревнующейся натуральной атлетки.' },
  { name: 'Полубогиня', minScore: 87, gate: { ffmiMin: 20, bodyFatMax: 22, shoulderWaistMin: 1.38 }, blurb: 'Около натурального потолка.' },
  {
    name: 'Греческая богиня',
    minScore: 95,
    gate: { ffmiMin: 20.5, bodyFatMin: 16, bodyFatMax: 22, shoulderWaistMin: 1.4, strengthScoreMin: 90 },
    blurb: 'Натуральный потолок: FFMI ≈ 21, жир 16–22 %, плечи/талия ≥ 1.4, элитная сила.',
  },
];

export const LEVELS_BY_SEX: Record<Sex, LevelDef[]> = { male: MALE, female: FEMALE };
/** Совместимость: мужская шкала. */
export const LEVELS = MALE;

/**
 * Скорость набора сухой массы у тренированных — эвристика с высокой неопределённостью.
 * Ориентир: стаж 4+ лет ≈ 1–2.5 кг сухой массы в год при профиците (у женщин ≈ вдвое меньше).
 * Рекомендуемый темп набора для опытных — 0.25–0.5 % массы/нед (Iraki et al., 2019, обзор).
 */
export const LEAN_GAIN_KG_PER_YEAR: Record<'novice' | 'intermediate' | 'advanced', [number, number]> = {
  novice: [5, 9],
  intermediate: [2.5, 5],
  advanced: [1, 2.5],
};
/** Темп сушки, % массы в неделю (Helms 2014; Garthe 2011). */
export const FAT_LOSS_PCT_PER_WEEK: [number, number] = [0.5, 1];
