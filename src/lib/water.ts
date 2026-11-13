// Вода за день: простая сумма в миллилитрах.
export interface WaterDay {
  date: string;
  ml: number;
}
export const WATER_MAX_ML = 10000;
/** Прибавить (или убавить) воду: не ниже нуля и не выше разумного предела. */
export const addWater = (current: number, deltaMl: number) => Math.max(0, Math.min(WATER_MAX_ML, current + deltaMl));
