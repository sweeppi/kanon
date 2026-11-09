// Конфигурация уровней прокачки. Обоснование весов и порогов — docs в README («Уровни»).
// Всё здесь — эвристика автора приложения, опирающаяся на ориентиры из исследований (FFMI — Kouri 1995,
// темп сушки — Helms 2014 / Garthe 2011). Править можно свободно: тесты проверяют только монотонность.

export const COMPONENT_WEIGHTS = {
  ffmi: 0.3, // главный показатель мышечной массы с поправкой на рост
  bodyFat: 0.2, // рельеф и здоровье
  shoulderWaist: 0.15, // V-силуэт
  reeves: 0.15, // гармония пропорций
  strength: 0.2, // относительная сила в жиме, приседе, тяге
} as const;
export type Component = keyof typeof COMPONENT_WEIGHTS;

/** Линейная нормализация в 0–100: [значение при 0 баллов, значение при 100 баллах]. */
export const NORMALIZE = {
  ffmi: [18, 25], // нормализованный FFMI: 18 ≈ нетренированный, 25 ≈ натуральный потолок (Kouri 1995)
  bodyFat: [25, 10], // % жира: 25 % → 0, ≤ 10 % → 100 (ниже 6 % балл снижается — не здоровая зона)
  shoulderWaist: [1.2, 1.618],
  reeves: [75, 100], // средний % соответствия Ривзу
} as const;

/** Относительная сила (1ПМ / вес тела): [новичок → 0 баллов, элита → 100 баллов]. Эвристика. */
export const STRENGTH_STANDARDS = {
  bench: [0.75, 1.75],
  squat: [1.0, 2.25],
  deadlift: [1.25, 2.75],
} as const;
export type Lift = keyof typeof STRENGTH_STANDARDS;

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
  /** Обязательные условия (без них уровень не присваивается, даже при высоком балле). */
  gate?: Gate;
  blurb: string;
}

export const LEVELS: LevelDef[] = [
  { name: 'Старт', minScore: 0, blurb: 'Точка отсчёта. Важно начать измерять.' },
  { name: 'Новичок', minScore: 15, blurb: 'Первые адаптации, база техники.' },
  { name: 'Любитель', minScore: 28, blurb: 'Регулярные тренировки дают заметный результат.' },
  { name: 'Атлет', minScore: 40, gate: { ffmiMin: 20 }, blurb: 'Тренированное тело выше среднего.' },
  { name: 'Продвинутый', minScore: 52, gate: { ffmiMin: 21, bodyFatMax: 18 }, blurb: 'Годы стажа видны без футболки.' },
  { name: 'Эстет', minScore: 64, gate: { ffmiMin: 22, bodyFatMax: 15, shoulderWaistMin: 1.4 }, blurb: 'Рельеф и V-силуэт.' },
  { name: 'Элита', minScore: 76, gate: { ffmiMin: 23, bodyFatMax: 13, shoulderWaistMin: 1.5 }, blurb: 'Уровень соревнующегося натурала.' },
  {
    name: 'Полубог',
    minScore: 87,
    gate: { ffmiMin: 24, bodyFatMax: 12, shoulderWaistMin: 1.55, reevesMin: 90 },
    blurb: 'Около натурального потолка.',
  },
  {
    name: 'Греческий бог',
    minScore: 95,
    gate: { ffmiMin: 24.5, bodyFatMin: 8, bodyFatMax: 11, shoulderWaistMin: 1.6, reevesMin: 95, strengthScoreMin: 90 },
    blurb: 'Натуральный потолок: FFMI ≈ 25, жир 8–11 %, плечи/талия ≥ 1.6, пропорции Ривза ≥ 95 %, элитная сила.',
  },
];

/**
 * Скорость набора сухой массы у тренированных — эвристика с высокой неопределённостью.
 * Ориентир: при стаже 4+ лет ≈ 1–2.5 кг сухой массы в год при профиците. Рекомендуемый темп набора веса
 * для опытных — 0.25–0.5 % массы/нед (Iraki et al., 2019, обзор; часть прироста — жир).
 */
export const LEAN_GAIN_KG_PER_YEAR: Record<'novice' | 'intermediate' | 'advanced', [number, number]> = {
  novice: [5, 9],
  intermediate: [2.5, 5],
  advanced: [1, 2.5],
};
/** Темп сушки, % массы в неделю (Helms 2014; Garthe 2011). */
export const FAT_LOSS_PCT_PER_WEEK: [number, number] = [0.5, 1];
