// Общие типы и константы 3D-модели (используются и сборщиком модели, и приложением).

/** Мышечные зоны вершин (атрибут _ZONE в GLB). */
export const ZONES = {
  neutral: 0,
  neck: 1,
  shoulders: 2,
  chest: 3,
  back: 4,
  arms: 5,
  forearms: 6,
  waist: 7,
  hips: 8,
  thighs: 9,
  calves: 10,
} as const;
export type ZoneName = keyof typeof ZONES;

/**
 * Параметры морфов. Каждый параметр p ∈ [-1, 1] (допускаем до ±1.6 с пометкой «за пределами модели»):
 * p > 0 → вес морфа `${name}_incr` = p, p < 0 → вес `${name}_decr` = −p. Так устроены модификаторы MakeHuman.
 */
export const MORPH_PARAMS = [
  'sex', // 0 — мужчина (база), 1 — женщина (средний женский таргет MakeHuman)
  'height',
  'muscle',
  'fat',
  'neck',
  'shoulders',
  'chest',
  'waist',
  'hips',
  'biceps',
  'forearm',
  'thigh',
  'calf',
  'wrist',
  'ankle',
  'knee',
] as const;
export type MorphParam = (typeof MORPH_PARAMS)[number];

/** Ключи замеров, которые модель умеет калибровать (совпадают с полями замеров, см). */
export const SLICE_KEYS = [
  'neck',
  'shoulders',
  'chest',
  'waist',
  'hips',
  'biceps',
  'forearm',
  'wrist',
  'thigh',
  'knee',
  'calf',
  'ankle',
] as const;
export type SliceKey = (typeof SLICE_KEYS)[number];

export interface SliceDef {
  key: SliceKey;
  /** Точки (суставы) — начало и конец отрезка. */
  a: string;
  b: string;
  /** Доля вдоль отрезка a→b. */
  t: number;
  /** 'axis' — плоскость перпендикулярна отрезку; 'up' — горизонтальная. */
  normal: 'axis' | 'up';
  /** Отсечение дальних точек сечения, м. */
  radius: number;
  /** Индексы сегментов скелета, чьи треугольники участвуют в сечении. */
  segs?: number[];
  /** Если задано: отбрасываем точки сечения с |x| > lateral · |x левого плечевого сустава| (убирает руки у торса). */
  lateral?: number;
}

export interface Landmarks {
  version: number;
  morphNames: string[];
  segNames: string[];
  top: number;
  bottom: number;
  points: Record<string, { base: [number, number, number]; d: Record<string, [number, number, number]> }>;
  slices: SliceDef[];
}
