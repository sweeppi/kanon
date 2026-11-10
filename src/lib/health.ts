// Ограничения по здоровью: какие упражнения помечать и что предложить взамен.
// Это подсказки, а не медицинские рекомендации и не диагноз. Боль, онемение, головокружение — стоп и к врачу.
import type { RiskTag } from './hevy/exercises';

export type HealthFlag =
  | 'hyperlordosis'
  | 'kyphosis'
  | 'scoliosis'
  | 'lowBackPain'
  | 'disc'
  | 'neck'
  | 'shoulder'
  | 'elbowWrist'
  | 'knee'
  | 'hypertension';

export interface HealthFlagDef {
  key: HealthFlag;
  label: string;
  hint: string;
  /** упражнения с этими тегами помечаются ⚠ */
  tags: RiskTag[];
  /** что предложить взамен / добавить */
  advice: string[];
}

export const HEALTH_FLAGS: HealthFlagDef[] = [
  {
    key: 'hyperlordosis',
    label: 'Гиперлордоз (прогиб в пояснице)',
    hint: 'Осевая нагрузка и переразгибание поясницы помечаются.',
    tags: ['axial', 'lumbarExtension'],
    advice: ['Стабилизация кора: dead bug, bird dog, боковая планка', 'Тренажёрные аналоги с опорой спины', 'Растяжка сгибателей бедра'],
  },
  {
    key: 'kyphosis',
    label: 'Сутулость / кифоз',
    hint: 'Помечается тяжёлая работа над головой; проверяется баланс жимов и тяг.',
    tags: ['overhead'],
    advice: ['Тяг в неделю не меньше, чем жимов', 'Тяга к лицу, разведения в наклоне, тяга с упором грудью', 'Мобилизация грудного отдела'],
  },
  {
    key: 'scoliosis',
    label: 'Сколиоз',
    hint: 'Тяжёлая осевая нагрузка помечается; полезны односторонние упражнения.',
    tags: ['axial', 'valsalva'],
    advice: ['Односторонние упражнения (выпады, тяга одной рукой)', 'Тренажёры с опорой спины', 'Упражнения по программе врача ЛФК'],
  },
  {
    key: 'lowBackPain',
    label: 'Боль в пояснице',
    hint: 'Осевая нагрузка, скручивания и тяжёлые базовые помечаются.',
    tags: ['axial', 'spinalFlexion', 'lumbarExtension', 'valsalva'],
    advice: ['Стабилизация кора (McGill big 3)', 'Тренажёры с опорой спины', 'Постепенное наращивание нагрузки без боли'],
  },
  {
    key: 'disc',
    label: 'Протрузия / грыжа диска',
    hint: 'Осевая нагрузка, сгибание позвоночника под весом и натуживание помечаются.',
    tags: ['axial', 'spinalFlexion', 'valsalva', 'impact'],
    advice: ['Только с одобрения врача', 'Тренажёры с опорой спины', 'Без скручиваний — планки и anti-rotation'],
  },
  {
    key: 'neck',
    label: 'Шея (боль, протрузия в шейном отделе)',
    hint: 'Нагрузка на шею и тяжёлые шраги/переноски помечаются.',
    tags: ['neckLoad', 'axial'],
    advice: ['Шраги в тренажёре или лёгкие', 'Нейтральное положение головы'],
  },
  {
    key: 'shoulder',
    label: 'Плечо (импинджмент, травма)',
    hint: 'Работа над головой, брусья, протяжки и жим из-за головы помечаются.',
    tags: ['overhead', 'shoulderImpingement'],
    advice: ['Жим под углом 30–45° вместо вертикального', 'Тяга к лицу, внешняя ротация', 'Нейтральный хват'],
  },
  {
    key: 'elbowWrist',
    label: 'Локоть / запястье',
    hint: 'Упражнения с нагрузкой на запястье в разгибании помечаются.',
    tags: ['wristLoad'],
    advice: ['Нейтральный хват, гантели вместо прямого грифа', 'Кистевые бинты, меньшие веса'],
  },
  {
    key: 'knee',
    label: 'Колено (боль, травма)',
    hint: 'Глубокое сгибание под весом, разгибания ног и прыжки помечаются.',
    tags: ['deepKnee', 'kneeShear', 'impact'],
    advice: ['Неполная амплитуда без боли', 'Ягодичный мост, сгибания ног', 'Велотренажёр вместо бега'],
  },
  {
    key: 'hypertension',
    label: 'Повышенное давление',
    hint: 'Тяжёлые базовые с задержкой дыхания (натуживание) помечаются.',
    tags: ['valsalva'],
    advice: ['Не задерживать дыхание, выдох на усилии', 'Подходы на 8–15 повторов вместо околопредельных', 'Контроль давления у врача'],
  },
];

export const FLAG_BY_KEY = Object.fromEntries(HEALTH_FLAGS.map((f) => [f.key, f])) as Record<HealthFlag, HealthFlagDef>;

export type HealthFlags = Partial<Record<HealthFlag, boolean>>;

export const activeFlags = (f: HealthFlags | undefined) => HEALTH_FLAGS.filter((d) => f?.[d.key]);

/** Какие флаги затрагивает упражнение с данными тегами. */
export function flagsForTags(tags: RiskTag[] | undefined, flags: HealthFlags | undefined): HealthFlagDef[] {
  if (!tags?.length) return [];
  return activeFlags(flags).filter((d) => d.tags.some((t) => tags.includes(t)));
}
