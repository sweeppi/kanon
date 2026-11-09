// Справочник упражнений → мышечные группы. Названия Hevy (англ.) и частые русские.
// Правило подсчёта: основная мышца = 1 подход, вспомогательная = 0.5 (распространённая условность, эвристика).
import type { ZoneName } from '../model/schema';

export type Muscle =
  | 'chest'
  | 'back'
  | 'traps'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'abs'
  | 'neck';

export const MUSCLE_RU: Record<Muscle, string> = {
  chest: 'Грудь',
  back: 'Спина (широчайшие)',
  traps: 'Трапеции',
  shoulders: 'Дельты',
  biceps: 'Бицепс',
  triceps: 'Трицепс',
  forearms: 'Предплечья',
  quads: 'Квадрицепс',
  hamstrings: 'Бицепс бедра',
  glutes: 'Ягодицы',
  calves: 'Икры',
  abs: 'Пресс / кор',
  neck: 'Шея',
};

export const MUSCLE_ZONE: Record<Muscle, ZoneName> = {
  chest: 'chest',
  back: 'back',
  traps: 'back',
  shoulders: 'shoulders',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'forearms',
  quads: 'thighs',
  hamstrings: 'thighs',
  glutes: 'hips',
  calves: 'calves',
  abs: 'waist',
  neck: 'neck',
};

export interface ExerciseInfo {
  primary: Muscle[];
  secondary: Muscle[];
  /** Осевая нагрузка на позвоночник (флаг «гиперлордоз»). */
  axial?: boolean;
  /** Ключевой базовый подъём для силовых стандартов. */
  lift?: 'bench' | 'squat' | 'deadlift';
}

// Порядок важен: первое совпадение по регулярному выражению выигрывает.
const RULES: Array<[RegExp, ExerciseInfo]> = [
  [/romanian|rdl|румынск|stiff/i, { primary: ['hamstrings', 'glutes'], secondary: ['back'], axial: true }],
  [/^deadlift \(barbell\)|^становая|^deadlift$|sumo deadlift|трэп|trap bar/i, { primary: ['hamstrings', 'glutes', 'back'], secondary: ['quads', 'traps', 'forearms'], axial: true, lift: 'deadlift' }],
  [/deadlift|тяга становая/i, { primary: ['hamstrings', 'glutes'], secondary: ['back', 'forearms'], axial: true }],
  [/good morning|гуд.?морнинг/i, { primary: ['hamstrings'], secondary: ['glutes', 'back'], axial: true }],
  [/front squat|фронтальн/i, { primary: ['quads'], secondary: ['glutes', 'abs'], axial: true }],
  [/^squat \(barbell\)|^приседания со штангой|back squat|^squat$/i, { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'abs'], axial: true, lift: 'squat' }],
  [/hack squat|гакк/i, { primary: ['quads'], secondary: ['glutes'] }],
  [/belt squat/i, { primary: ['quads', 'glutes'], secondary: [] }],
  [/goblet|split squat|bulgarian|болгар|lunge|выпад/i, { primary: ['quads', 'glutes'], secondary: ['hamstrings'] }],
  [/squat|присед/i, { primary: ['quads', 'glutes'], secondary: ['hamstrings'], axial: true }],
  [/leg press|жим ног/i, { primary: ['quads', 'glutes'], secondary: [] }],
  [/leg extension|разгибани.*ног/i, { primary: ['quads'], secondary: [] }],
  [/leg curl|сгибани.*ног/i, { primary: ['hamstrings'], secondary: [] }],
  [/hip thrust|glute bridge|ягодичн.*мост/i, { primary: ['glutes'], secondary: ['hamstrings'] }],
  [/calf|икр|носк/i, { primary: ['calves'], secondary: [] }],
  [/^bench press \(barbell\)|^жим лёжа|^жим лежа|^bench press$/i, { primary: ['chest'], secondary: ['triceps', 'shoulders'], lift: 'bench' }],
  [/incline.*press|наклон.*жим|жим.*наклон/i, { primary: ['chest', 'shoulders'], secondary: ['triceps'] }],
  [/bench press|chest press|жим.*лёж|жим.*леж|floor press/i, { primary: ['chest'], secondary: ['triceps', 'shoulders'] }],
  [/fly|flye|разводк|pec deck|crossover|кроссовер/i, { primary: ['chest'], secondary: ['shoulders'] }],
  [/push.?up|отжиман/i, { primary: ['chest'], secondary: ['triceps', 'shoulders'] }],
  [/dip|брусь/i, { primary: ['chest', 'triceps'], secondary: ['shoulders'] }],
  [/overhead press|military|standing.*press|армейск|жим стоя/i, { primary: ['shoulders'], secondary: ['triceps'], axial: true }],
  [/shoulder press|seated.*press|arnold|жим сидя|жим.*гантел.*над/i, { primary: ['shoulders'], secondary: ['triceps'] }],
  [/lateral raise|махи|разведени.*в стороны|upright row/i, { primary: ['shoulders'], secondary: ['traps'] }],
  [/rear delt|reverse fly|face pull|задн.*дельт/i, { primary: ['shoulders'], secondary: ['back', 'traps'] }],
  [/front raise/i, { primary: ['shoulders'], secondary: [] }],
  [/shrug|шраг/i, { primary: ['traps'], secondary: [] }],
  [/chest supported|seal row|t-bar row \(chest|упором/i, { primary: ['back'], secondary: ['biceps', 'shoulders'] }],
  [/bent over row|pendlay|barbell row|тяга штанги в наклоне/i, { primary: ['back'], secondary: ['biceps', 'traps'], axial: true }],
  [/row|тяга.*(гантел|блок|наклон|горизонт|к поясу)/i, { primary: ['back'], secondary: ['biceps'] }],
  [/pull.?up|chin.?up|подтягиван/i, { primary: ['back'], secondary: ['biceps'] }],
  [/pulldown|pullover|тяга.*верхн|пуловер/i, { primary: ['back'], secondary: ['biceps'] }],
  [/hammer curl|молот/i, { primary: ['biceps', 'forearms'], secondary: [] }],
  [/wrist curl|forearm|reverse curl|предплеч|запяст/i, { primary: ['forearms'], secondary: [] }],
  [/curl|сгибани.*рук|бицепс/i, { primary: ['biceps'], secondary: ['forearms'] }],
  [/skull|triceps|tricep|pushdown|французск|трицепс|разгибани.*рук|close.?grip|узким хват/i, { primary: ['triceps'], secondary: [] }],
  [/plank|dead bug|bird dog|pallof|crunch|sit.?up|leg raise|ab wheel|hanging knee|планк|скручиван|пресс|подъём ног|подъем ног/i, { primary: ['abs'], secondary: [] }],
  [/back extension|hyperextension|гиперэкст/i, { primary: ['back', 'glutes'], secondary: ['hamstrings'] }],
  [/neck|шея|шеи/i, { primary: ['neck'], secondary: [] }],
  [/farmer|фермер/i, { primary: ['forearms', 'traps'], secondary: ['abs'], axial: true }],
];

export function lookupExercise(title: string, overrides?: Record<string, ExerciseInfo>): ExerciseInfo | null {
  if (overrides?.[title]) return overrides[title];
  for (const [re, info] of RULES) if (re.test(title)) return info;
  return null;
}

/** Альтернативы без осевой нагрузки + упражнения на стабилизацию кора (подсказка, не диагноз). */
export const AXIAL_ALTERNATIVES: Record<string, string[]> = {
  squat: ['Жим ногами', 'Гакк-присед', 'Присед с поясом (belt squat)', 'Болгарские выпады с гантелями'],
  deadlift: ['Ягодичный мост / hip thrust', 'Сгибания ног', 'Гиперэкстензия с нейтральной поясницей'],
  row: ['Тяга с упором грудью в скамью', 'Тяга в тренажёре', 'Тяга гантели одной рукой с упором'],
  press: ['Жим гантелей сидя со спинкой', 'Жим в тренажёре'],
  default: ['Тренажёрный аналог с опорой для спины'],
};
export const CORE_STABILITY = ['Dead bug', 'Bird dog', 'Боковая планка', 'Pallof press', 'Модифицированные скручивания (McGill)'];

export function alternativesFor(title: string): string[] {
  const t = title.toLowerCase();
  if (/squat|присед/.test(t)) return AXIAL_ALTERNATIVES.squat;
  if (/deadlift|good morning|становая|rdl|romanian|румын/.test(t)) return AXIAL_ALTERNATIVES.deadlift;
  if (/row|тяга/.test(t)) return AXIAL_ALTERNATIVES.row;
  if (/press|жим/.test(t)) return AXIAL_ALTERNATIVES.press;
  return AXIAL_ALTERNATIVES.default;
}
