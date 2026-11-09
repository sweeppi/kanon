// Замеры → цели калибровки. Без three.js, чтобы не тянуть его в стартовый чанк.
import type { Targets } from './calibrate';
import type { MeasureField } from '../data/db';

/** Замеры пользователя → цели калибровки. Бицепс модели — расслабленный; если есть только «в напряжении» — ×0.92 (эвристика). */
export function targetsFromValues(v: Partial<Record<MeasureField, number>>, heightCm?: number): Targets {
  const t: Targets = {};
  if (heightCm) t.height = heightCm;
  const copy: Array<[MeasureField, keyof Targets]> = [
    ['neck', 'neck'],
    ['shoulders', 'shoulders'],
    ['chest', 'chest'],
    ['waist', 'waist'],
    ['hips', 'hips'],
    ['forearm', 'forearm'],
    ['wrist', 'wrist'],
    ['thigh', 'thigh'],
    ['knee', 'knee'],
    ['calf', 'calf'],
    ['ankle', 'ankle'],
  ];
  for (const [from, to] of copy) if (v[from]) t[to] = v[from];
  if (v.bicepsRelaxed) t.biceps = v.bicepsRelaxed;
  else if (v.bicepsFlexed) t.biceps = v.bicepsFlexed * 0.92;
  return t;
}
