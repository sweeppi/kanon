// Описание полей замеров: подписи, диапазоны, режим (расслабить / напрячь / кость) и подсказки «как мерить».
import type { MeasureField } from './data/db';

export type MeasureMode = 'relaxed' | 'flexed' | 'bone' | 'scale';
export const MODE_RU: Record<MeasureMode, { label: string; tone: 'good' | 'accent' | 'warn' | 'muted' }> = {
  relaxed: { label: 'Не напрягать', tone: 'muted' },
  flexed: { label: 'Напрячь', tone: 'accent' },
  bone: { label: 'Кость, один раз', tone: 'muted' },
  scale: { label: 'Весы', tone: 'muted' },
};

export interface FieldMeta {
  key: MeasureField;
  label: string;
  unit: string;
  min: number;
  max: number;
  mode: MeasureMode;
  hint: string;
  /** положение ленты на мини-иллюстрации: y (0–140), x-диапазон */
  fig?: { y: number; x1: number; x2: number; tilt?: number };
}

export const STANDARD_RULE =
  'Утром, натощак, после туалета, до тренировки, одной и той же неэластичной лентой. Лента прилегает плотно, но не врезается в кожу. Каждый обхват — 2 раза, записывайте среднее. Напрягать мышцу нужно только там, где написано «Напрячь», во всех остальных — стоять расслабленно и спокойно дышать.';

export const FIELD_GROUPS: Array<{ title: string; keys: MeasureField[] }> = [
  { title: 'Вес и рост', keys: ['weight', 'height', 'bodyFatInput'] },
  { title: 'Торс (не напрягать)', keys: ['neck', 'shoulders', 'chest', 'waist', 'hips'] },
  { title: 'Руки', keys: ['bicepsFlexed', 'tricepsFlexed', 'bicepsRelaxed', 'forearm'] },
  { title: 'Ноги (не напрягать)', keys: ['thigh', 'calf'] },
  { title: 'Кости — мерить один раз', keys: ['wrist', 'knee', 'ankle'] },
];

export const FIELDS: FieldMeta[] = [
  { key: 'weight', label: 'Вес', unit: 'кг', min: 30, max: 250, mode: 'scale', hint: 'Утром после туалета, без одежды, на одних и тех же весах.' },
  { key: 'height', label: 'Рост', unit: 'см', min: 120, max: 230, mode: 'bone', hint: 'Без обуви, пятки, ягодицы и лопатки касаются стены. Достаточно мерить раз в год.' },
  { key: 'bodyFatInput', label: '% жира (весы/калипер)', unit: '%', min: 3, max: 60, mode: 'scale', hint: 'Необязательно. Если не указан — считаем по формуле ВМС США из шеи и талии.' },
  { key: 'neck', label: 'Шея', unit: 'см', min: 25, max: 60, mode: 'relaxed', hint: 'Не напрягать. Сразу под кадыком, взгляд прямо, лента чуть наклонена вперёд-вниз.', fig: { y: 22, x1: 25, x2: 35 } },
  { key: 'shoulders', label: 'Плечи (дельты)', unit: 'см', min: 80, max: 170, mode: 'relaxed', hint: 'Не напрягать, руки опущены вдоль тела. Горизонтально по самой широкой точке дельт, на спокойном выдохе.', fig: { y: 32, x1: 10, x2: 50 } },
  { key: 'chest', label: 'Грудь', unit: 'см', min: 70, max: 160, mode: 'relaxed', hint: 'Не напрягать, не надувать грудь. По соскам и под мышками, горизонтально, на спокойном выдохе.', fig: { y: 40, x1: 14, x2: 46 } },
  { key: 'waist', label: 'Талия (пупок)', unit: 'см', min: 50, max: 160, mode: 'relaxed', hint: 'Не втягивать и не надувать живот. Горизонтально на уровне пупка, на спокойном выдохе.', fig: { y: 60, x1: 17, x2: 43 } },
  { key: 'hips', label: 'Таз (ягодицы)', unit: 'см', min: 60, max: 170, mode: 'relaxed', hint: 'Не напрягать ягодицы. Стопы вместе, по самой выступающей точке ягодиц.', fig: { y: 74, x1: 15, x2: 45 } },
  { key: 'bicepsFlexed', label: 'Бицепс в напряжении', unit: 'см', min: 20, max: 60, mode: 'flexed', hint: 'Напрячь. Рука согнута под 90°, кулак к плечу, бицепс максимально сжат; лента по самому высокому месту (пику). Левая рука.', fig: { y: 44, x1: 48, x2: 56, tilt: -8 } },
  { key: 'tricepsFlexed', label: 'Трицепс в напряжении', unit: 'см', min: 20, max: 60, mode: 'flexed', hint: 'Напрячь. Рука выпрямлена вниз и чуть назад, ладонь к бедру, трицепс максимально сжат (как в позе «трицепс сбоку»); лента по самой широкой части плеча. Левая рука.', fig: { y: 46, x1: 47, x2: 56 } },
  { key: 'bicepsRelaxed', label: 'Бицепс расслабленный', unit: 'см', min: 20, max: 55, mode: 'relaxed', hint: 'Не напрягать. Рука висит вдоль тела, посередине между плечом и локтем.', fig: { y: 46, x1: 48, x2: 56 } },
  { key: 'forearm', label: 'Предплечье', unit: 'см', min: 18, max: 45, mode: 'relaxed', hint: 'Не сжимать кулак. Рука выпрямлена, ладонь вверх, по самой широкой части у локтя.', fig: { y: 60, x1: 50, x2: 57 } },
  { key: 'thigh', label: 'Бедро', unit: 'см', min: 35, max: 90, mode: 'relaxed', hint: 'Не напрягать. Стоя, вес на обе ноги, самая широкая часть сразу под ягодичной складкой. Левая нога.', fig: { y: 86, x1: 31, x2: 44 } },
  { key: 'calf', label: 'Голень', unit: 'см', min: 25, max: 60, mode: 'relaxed', hint: 'Не напрягать, не вставать на носки. Стоя, вес на обе ноги, самая широкая часть икры.', fig: { y: 114, x1: 32, x2: 41 } },
  { key: 'wrist', label: 'Запястье', unit: 'см', min: 12, max: 25, mode: 'bone', hint: 'Кость, меняется мало — достаточно один раз. Между косточкой (шиловидным отростком) и кистью.', fig: { y: 72, x1: 51, x2: 57 } },
  { key: 'knee', label: 'Колено', unit: 'см', min: 25, max: 55, mode: 'bone', hint: 'Кость — один раз. По центру надколенника, нога выпрямлена и расслаблена.', fig: { y: 104, x1: 32, x2: 41 } },
  { key: 'ankle', label: 'Лодыжка', unit: 'см', min: 15, max: 35, mode: 'bone', hint: 'Кость — один раз. Самое узкое место над косточками.', fig: { y: 130, x1: 33, x2: 40 } },
];

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<MeasureField, FieldMeta>;
