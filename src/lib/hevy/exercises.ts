// Справочник упражнений: мышцы, паттерн движения, оборудование, риск-теги для ограничений по здоровью.
// Распознаёт названия Hevy / Strong / FitNotes (англ.) и русские. Первое совпадение выигрывает,
// поэтому частные правила (бабочка, задняя дельта, румынская тяга) стоят раньше общих (жим, тяга).
// Подсчёт объёма: основная мышца = 1 подход, вспомогательная = 0.5 (распространённая условность, эвристика).
import type { ZoneName } from '../model/schema';

export type Muscle =
  | 'chest'
  | 'back'
  | 'traps'
  | 'shoulders'
  | 'rearDelts'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'adductors'
  | 'calves'
  | 'abs'
  | 'lowerBack'
  | 'neck';

export const MUSCLE_RU: Record<Muscle, string> = {
  chest: 'Грудь',
  back: 'Спина (широчайшие)',
  traps: 'Трапеции',
  shoulders: 'Дельты (передние/средние)',
  rearDelts: 'Задние дельты',
  biceps: 'Бицепс',
  triceps: 'Трицепс',
  forearms: 'Предплечья',
  quads: 'Квадрицепс',
  hamstrings: 'Бицепс бедра',
  glutes: 'Ягодицы',
  adductors: 'Приводящие бедра',
  calves: 'Икры',
  abs: 'Пресс / кор',
  lowerBack: 'Поясница (разгибатели)',
  neck: 'Шея',
};

export const MUSCLE_ZONE: Record<Muscle, ZoneName> = {
  chest: 'chest',
  back: 'back',
  traps: 'back',
  shoulders: 'shoulders',
  rearDelts: 'shoulders',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'forearms',
  quads: 'thighs',
  hamstrings: 'thighs',
  glutes: 'hips',
  adductors: 'thighs',
  calves: 'calves',
  abs: 'waist',
  lowerBack: 'back',
  neck: 'neck',
};

/** Паттерн движения — для «ключевых движений» вместо жёсткой тройки жим/присед/тяга. */
export type Pattern = 'hPush' | 'vPush' | 'squat' | 'hinge' | 'hPull' | 'vPull' | 'isolation' | 'core' | 'carry' | 'cardio';
export const PATTERN_RU: Record<Pattern, string> = {
  hPush: 'Жим горизонтальный',
  vPush: 'Жим вертикальный',
  squat: 'Присед / жим ногами',
  hinge: 'Наклон / разгибание бедра',
  hPull: 'Тяга горизонтальная',
  vPull: 'Тяга вертикальная',
  isolation: 'Изоляция',
  core: 'Кор',
  carry: 'Переноска',
  cardio: 'Кардио',
};

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'smith' | 'bodyweight' | 'kettlebell' | 'band' | 'other';
export const EQUIPMENT_RU: Record<Equipment, string> = {
  barbell: 'штанга',
  dumbbell: 'гантели',
  machine: 'тренажёр',
  cable: 'блок',
  smith: 'Смит',
  bodyweight: 'свой вес',
  kettlebell: 'гиря',
  band: 'резина',
  other: 'другое',
};

/** Риск-теги для флагов здоровья. */
export type RiskTag =
  | 'axial' // осевая нагрузка на позвоночник
  | 'lumbarExtension' // переразгибание поясницы
  | 'spinalFlexion' // скручивания/сгибание позвоночника под нагрузкой
  | 'overhead' // руки над головой под весом
  | 'shoulderImpingement' // протяжки, жим из-за головы
  | 'deepKnee' // глубокое сгибание колена под весом
  | 'kneeShear' // сдвиг в колене (разгибания ног)
  | 'wristLoad' // нагрузка на запястья в разгибании
  | 'valsalva' // тяжёлые базовые с задержкой дыхания
  | 'impact' // удары/прыжки/бег
  | 'neckLoad';

export interface ExerciseInfo {
  primary: Muscle[];
  secondary: Muscle[];
  pattern?: Pattern;
  equipment?: Equipment;
  tags?: RiskTag[];
  /** совместимость со старыми ручными правками */
  axial?: boolean;
}

export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[_\-–—/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function detectEquipment(name: string): Equipment | undefined {
  const n = normalizeName(name);
  if (/smith|смит/.test(n)) return 'smith';
  if (/barbell|штанг|ez bar|ez гриф|т гриф|t bar|trap bar|гриф/.test(n)) return 'barbell';
  if (/dumbbell|гантел/.test(n)) return 'dumbbell';
  if (/kettlebell|гир[яиею]/.test(n)) return 'kettlebell';
  if (/cable|блок|кроссовер|crossover|rope|канат/.test(n)) return 'cable';
  if (/band|резин|ленты|эспандер/.test(n)) return 'band';
  if (/machine|тренаж|hammer strength|plate loaded|iso lateral|lever|selectorized|pec deck|leg press|жим ног|hack|гакк|pendulum|маятник/.test(n)) return 'machine';
  if (/bodyweight|собственн|свой вес|weighted|pull up|chin up|push up|dip|подтяг|отжим|брус/.test(n)) return 'bodyweight';
  return undefined;
}

type Rule = [RegExp, Omit<ExerciseInfo, 'equipment'> & { equipment?: Equipment }];
const R = (re: RegExp, primary: Muscle[], secondary: Muscle[], pattern: Pattern, tags: RiskTag[] = []): Rule => [re, { primary, secondary, pattern, tags }];

// ВАЖНО: порядок = приоритет.
const RULES: Rule[] = [
  // ---------- кардио и прыжки ----------
  R(/treadmill|running|^run|бег|jump rope|скакалк|burpee|берпи|box jump|прыж|jumping/, ['quads', 'calves'], [], 'cardio', ['impact']),
  R(/walk|ходьб|incline walk|elliptical|эллипс|bike|cycling|spin|велосип|велотрен|rowing machine|ergometer|гребн|stair|степпер|лестниц|swim|плаван/, ['quads'], ['calves'], 'cardio'),
  // ---------- шея ----------
  R(/neck|шея|шеи|шейн/, ['neck'], [], 'isolation', ['neckLoad']),
  // ---------- задние дельты (до «fly» и «row») ----------
  R(/rear delt|reverse fly|reverse pec|rear fly|задн[\wа-яё]* дельт|задн[\wа-яё]* пучк|face pull|тяга к лицу|разведени[\wа-яё]* .*в наклоне|махи .*в наклоне/, ['rearDelts'], ['traps', 'back'], 'isolation'),
  // ---------- ягодицы: отведение назад (до трицепсового kickback) ----------
  R(/glute kick|kickback .*(glute|ног|ягод)|(glute|ягод[\wа-яё]*) .*kickback|cable kickback|отведени[\wа-яё]* ног[\wа-яё]* назад|ягодичн[\wа-яё]* .*отвед|махи ногой назад/, ['glutes'], [], 'isolation'),
  // ---------- икры и ноги в тренажёрах (до «жим ... в тренажёре») ----------
  R(/calf|икр|голен|на носки|подъем[\wа-яё]* на носк|носки/, ['calves'], [], 'isolation'),
  R(/sissy|сисси/, ['quads'], [], 'squat', ['deepKnee', 'kneeShear']),
  R(/hack squat|гакк|pendulum|маятник/, ['quads', 'glutes'], [], 'squat', ['deepKnee']),
  R(/belt squat|присед[\wа-яё]* .*с поясом|присед[\wа-яё]* .*пояс/, ['quads', 'glutes'], [], 'squat', ['deepKnee']),
  R(/leg press|жим ног|жим платформ|платформ/, ['quads', 'glutes'], ['hamstrings'], 'squat', ['deepKnee']),
  R(/hip adduct|adductor|аддукц|сведени[\wа-яё]* ног|приводящ/, ['adductors'], [], 'isolation'),
  // ---------- грудь: изоляция ----------
  R(/pec deck|butterfly|бабочк|пек дек|сведени[\wа-яё]* рук|сведени[\wа-яё]* .*(тренаж|блок|кроссовер)|crossover|кроссовер|cable fly|chest fly|fly|flye|разведени[\wа-яё]* (гантелей )?(лежа|на скамье|на наклон)|разводк/, ['chest'], ['shoulders'], 'isolation'),
  R(/pullover|пуловер/, ['back', 'chest'], ['triceps'], 'isolation'),
  // ---------- трицепс (до «жим» из-за «жим узким хватом» и до «extension») ----------
  R(/close grip bench|close grip press|жим .*узк[\wа-яё]* хват|узк[\wа-яё]* хват[\wа-яё]* жим|jm press/, ['triceps'], ['chest', 'shoulders'], 'hPush', ['wristLoad']),
  R(/overhead (triceps |tricep )?extension|french press|французск|разгибани[\wа-яё]* (рук|руки) из-за головы|разгибани[\wа-яё]* .*над головой/, ['triceps'], [], 'isolation', ['overhead']),
  R(/triceps|tricep|pushdown|push down|skull ?crusher|lying extension|разгибани[\wа-яё]* рук|трицепс|kickback(?!.*glute)/, ['triceps'], [], 'isolation'),
  // ---------- брусья, отжимания ----------
  R(/dip|брусь|брусья/, ['chest', 'triceps'], ['shoulders'], 'hPush', ['shoulderImpingement']),
  R(/push ?up|отжимани/, ['chest'], ['triceps', 'shoulders'], 'hPush', ['wristLoad']),
  // ---------- плечи ----------
  R(/upright row|протяжк|тяга к подбородк/, ['shoulders', 'traps'], [], 'isolation', ['shoulderImpingement']),
  R(/behind (the )?neck|из за головы|из-за головы/, ['shoulders'], ['triceps'], 'vPush', ['overhead', 'shoulderImpingement']),
  R(/lateral raise|side raise|lateral delt|y raise|lu raise|махи|разведени[\wа-яё]* .*в стороны|подъем[\wа-яё]* .*в стороны/, ['shoulders'], ['traps'], 'isolation'),
  R(/front raise|подъем[\wа-яё]* .*перед собой|передн[\wа-яё]* дельт/, ['shoulders'], [], 'isolation'),
  R(/push press|military|overhead press|ohp|standing (shoulder |military )?press|армейск|жим стоя|жим .*стоя/, ['shoulders'], ['triceps', 'abs'], 'vPush', ['overhead', 'axial', 'valsalva']),
  R(/arnold|shoulder press|seated (dumbbell )?press|landmine press|жим .*над головой|жим (гантел[\wа-яё]*|штанг[\wа-яё]*) сидя|жим сидя (гантел|штанг)|жим плеч|жим вверх|жим .*(на|для) плеч/, ['shoulders'], ['triceps'], 'vPush', ['overhead']),
  // ---------- грудь: жимы ----------
  R(/incline .*(press|bench)|наклон[\wа-яё]* (жим|скамь)|жим .*наклон|верх[\wа-яё]* груд/, ['chest', 'shoulders'], ['triceps'], 'hPush'),
  R(/decline|жим .*(головой вниз|обратн[\wа-яё]* наклон)/, ['chest'], ['triceps'], 'hPush'),
  R(/chest press|жим от груди|жим .*в тренажер|hammer strength press|iso lateral (chest )?press|machine press/, ['chest'], ['triceps', 'shoulders'], 'hPush'),
  R(/bench press|floor press|dumbbell press|жим лежа|жим .*лежа|жим штанги|жим гантел/, ['chest'], ['triceps', 'shoulders'], 'hPush', ['valsalva']),
  // ---------- спина: вертикальные тяги ----------
  R(/assisted (pull|chin)|гравитрон|подтягивани[\wа-яё]* .*(помощ|гравитрон)/, ['back'], ['biceps'], 'vPull'),
  R(/pull ?up|chin ?up|подтягиван/, ['back'], ['biceps', 'rearDelts'], 'vPull'),
  R(/pulldown|pull down|тяга верхн|верхн[\wа-яё]* блок|тяга .*к груди|вертикальн[\wа-яё]* тяга|тяга вертикальн|тяга сверху/, ['back'], ['biceps', 'rearDelts'], 'vPull'),
  // ---------- спина: горизонтальные тяги ----------
  R(/chest supported|seal row|incline .*row|row .*incline|с упором|упором (в|на)|на наклонной скамье.*тяга|тяга .*на наклонной/, ['back'], ['rearDelts', 'biceps'], 'hPull'),
  R(/pendlay|yates|bent over row|barbell row|тяга штанги в наклоне|тяга .*в наклоне|t bar row|т гриф|t-bar/, ['back'], ['rearDelts', 'biceps', 'lowerBack'], 'hPull', ['axial']),
  R(/row|тяга .*(гантел|блок|тренаж|к поясу|горизонтальн|нижн|сидя|одной рукой)|горизонтальн[\wа-яё]* тяга/, ['back'], ['rearDelts', 'biceps'], 'hPull'),
  // ---------- поясница / ягодицы ----------
  R(/back extension|hyperextension|reverse hyper|гиперэкстенз|разгибани[\wа-яё]* спины|разгибани[\wа-яё]* .*поясниц/, ['lowerBack', 'glutes'], ['hamstrings'], 'hinge', ['lumbarExtension']),
  R(/good morning|гуд ?морнинг/, ['hamstrings', 'lowerBack'], ['glutes'], 'hinge', ['axial', 'lumbarExtension']),
  R(/hip thrust|glute bridge|pull through|ягодичн[\wа-яё]* мост|мостик|тяга бедром|ягодичн[\wа-яё]* тяг/, ['glutes'], ['hamstrings'], 'hinge'),
  R(/hip abduct|abductor|абдукц|разведени[\wа-яё]* ног|отведени[\wа-яё]* ног[\wа-яё]* в сторон|ягодичн[\wа-яё]* .*сидя/, ['glutes'], [], 'isolation'),
  // ---------- становые ----------
  R(/romanian|rdl|stiff leg|stiff legged|straight leg deadlift|румынск|мертв[\wа-яё]* тяг|на прямых ногах/, ['hamstrings', 'glutes'], ['lowerBack', 'forearms'], 'hinge', ['axial']),
  R(/rack pull|block pull|тяга с плинт|тяга с бруск/, ['back', 'glutes', 'traps'], ['lowerBack'], 'hinge', ['axial', 'valsalva']),
  R(/deadlift|становая|становой|тяга становая|sumo|сумо|trap bar|трэп/, ['glutes', 'hamstrings', 'back'], ['quads', 'traps', 'forearms', 'lowerBack'], 'hinge', ['axial', 'valsalva']),
  // ---------- ноги ----------
  R(/leg extension|разгибани[\wа-яё]* ног/, ['quads'], [], 'isolation', ['kneeShear']),
  R(/nordic|нордическ|leg curl|hamstring curl|сгибани[\wа-яё]* ног|сгибани[\wа-яё]* .*бедр/, ['hamstrings'], [], 'isolation'),
  R(/bulgarian|split squat|болгарск|сплит|lunge|выпад|step up|зашагиван|pistol|пистолет/, ['quads', 'glutes'], ['hamstrings', 'adductors'], 'squat', ['deepKnee']),
  R(/goblet|кубков/, ['quads', 'glutes'], ['abs'], 'squat', ['deepKnee']),
  R(/front squat|фронтальн[\wа-яё]* присед|присед[\wа-яё]* .*на груди/, ['quads', 'glutes'], ['abs'], 'squat', ['axial', 'deepKnee', 'wristLoad', 'valsalva']),
  R(/squat|присед/, ['quads', 'glutes'], ['hamstrings', 'adductors', 'lowerBack'], 'squat', ['axial', 'deepKnee', 'valsalva']),
  // ---------- руки ----------
  R(/wrist|запяст|forearm|предплеч|reverse curl|обратн[\wа-яё]* хват[\wа-яё]* .*сгиб|сгибани[\wа-яё]* .*обратн[\wа-яё]* хват/, ['forearms'], [], 'isolation', ['wristLoad']),
  R(/hammer curl|молот|молотк/, ['biceps', 'forearms'], [], 'isolation'),
  R(/curl|preacher|scott|скотт|concentration|концентр|spider|сгибани[\wа-яё]* рук|подъем[\wа-яё]* .*на бицепс|бицепс/, ['biceps'], ['forearms'], 'isolation'),
  // ---------- кор ----------
  R(/plank|планк|dead ?bug|bird ?dog|pallof|палоф|side bridge|hollow|ab wheel|ролик|rollout|stir the pot|anti rotation/, ['abs'], [], 'core'),
  R(/crunch|скручиван|sit ?up|подъем[\wа-яё]* туловищ|v up|jackknife|russian twist|toes to bar|toe to bar|knee raise|leg raise|подъем[\wа-яё]* ног|hanging|вис|пресс/, ['abs'], [], 'core', ['spinalFlexion']),
  // ---------- переноски ----------
  R(/farmer|фермер|suitcase|чемодан|carry|переноск/, ['forearms', 'traps'], ['abs'], 'carry', ['axial']),
  R(/shrug|шраг|пожимани/, ['traps'], ['forearms'], 'isolation'),
];

export function lookupExercise(title: string, overrides?: Record<string, ExerciseInfo>): ExerciseInfo | null {
  const equipment = detectEquipment(title);
  const o = overrides?.[title];
  if (o) {
    const tags = new Set(o.tags ?? []);
    if (o.axial) tags.add('axial');
    return { ...o, equipment: o.equipment ?? equipment, tags: [...tags], axial: tags.has('axial') };
  }
  const n = normalizeName(title);
  for (const [re, info] of RULES) {
    if (!re.test(n)) continue;
    const tags = new Set(info.tags ?? []);
    // Шраги и переноски со штангой/гантелями — осевая нагрузка
    if (/shrug|шраг/.test(n) && (equipment === 'barbell' || equipment === 'dumbbell' || equipment === 'smith')) tags.add('axial');
    // Тренажёры, блоки, упор грудью — без осевой нагрузки, если правило её добавило по названию движения
    if (equipment === 'machine' || equipment === 'cable') {
      if (!/smith|смит/.test(n)) tags.delete('axial');
      tags.delete('valsalva');
    }
    // Гантельные/гиревые выпады и приседы обычно легче — снимаем «тяжёлую задержку дыхания»
    if (equipment === 'dumbbell' || equipment === 'kettlebell') tags.delete('valsalva');
    // Смит-машина: штанга на плечах — осевая нагрузка сохраняется
    if (equipment === 'smith' && info.pattern === 'squat') tags.add('axial');
    return { ...info, equipment: equipment ?? info.equipment, tags: [...tags], axial: tags.has('axial') };
  }
  return null;
}

// ---------- силовые стандарты по паттернам (эвристика, не исследование) ----------
/** [новичок → 0 баллов, элита → 100 баллов] — отношение расчётного 1ПМ к весу тела. Для гантелей — вес одной гантели. */
export function strengthStandard(title: string, info: ExerciseInfo | null): [number, number] | null {
  if (!info?.pattern) return null;
  const n = normalizeName(title);
  const eq = info.equipment ?? 'other';
  switch (info.pattern) {
    case 'hPush':
      if (/close grip|узк|jm press|dip|брус|push ?up|отжим/.test(n)) return null;
      if (eq === 'barbell') return [0.75, 1.75];
      if (eq === 'smith') return [0.7, 1.65];
      if (eq === 'dumbbell') return [0.3, 0.75];
      if (eq === 'machine' || eq === 'cable') return [0.7, 1.7];
      return null;
    case 'vPush':
      if (eq === 'barbell' || eq === 'smith') return [0.5, 1.1];
      if (eq === 'dumbbell') return [0.2, 0.45];
      if (eq === 'machine') return [0.45, 1.1];
      return null;
    case 'squat':
      if (/leg press|жим ног|платформ/.test(n)) return [1.5, 4.0];
      if (/bulgarian|split|болгар|сплит|lunge|выпад|step up|pistol|пистолет/.test(n)) return eq === 'barbell' ? [0.5, 1.4] : [0.15, 0.45];
      if (/goblet|кубков/.test(n)) return [0.3, 0.8];
      if (eq === 'barbell') return [1.0, 2.25];
      if (eq === 'smith') return [0.9, 2.1];
      if (eq === 'machine') return [1.0, 2.5];
      return null;
    case 'hinge':
      if (/hip thrust|glute bridge|мост|тяга бедром/.test(n)) return [1.0, 3.0];
      if (/back extension|hyperext|гиперэкст|good morning|гуд/.test(n)) return null;
      if (/romanian|rdl|stiff|румын|мертв|прямых ног/.test(n)) return eq === 'dumbbell' ? [0.35, 0.9] : [0.9, 2.0];
      if (eq === 'barbell') return [1.25, 2.75];
      return null;
    case 'hPull':
      if (eq === 'dumbbell') return [0.3, 0.75];
      return [0.6, 1.4];
    case 'vPull':
      if (/assisted|гравитрон|помощ/.test(n)) return null;
      if (/pull ?up|chin ?up|подтяг/.test(n)) return null; // считаем отдельно: (вес тела + отягощение)/вес
      return [0.6, 1.3];
    default:
      return null;
  }
}

// ---------- альтернативы ----------
export const CORE_STABILITY = ['Dead bug', 'Bird dog', 'Боковая планка', 'Pallof press', 'Модифицированные скручивания (McGill)'];

export function alternativesFor(title: string): string[] {
  const t = normalizeName(title);
  if (/squat|присед/.test(t)) return ['Жим ногами', 'Гакк-присед', 'Присед с поясом (belt squat)', 'Болгарские выпады с гантелями'];
  if (/deadlift|good morning|становая|rdl|romanian|румын|rack pull/.test(t)) return ['Ягодичный мост / hip thrust', 'Сгибания ног', 'Румынская тяга с гантелями (лёгкая)'];
  if (/row|тяга/.test(t)) return ['Тяга с упором грудью в скамью', 'Тяга в тренажёре', 'Тяга гантели одной рукой с упором'];
  if (/press|жим/.test(t)) return ['Жим гантелей сидя со спинкой', 'Жим в тренажёре'];
  if (/shrug|шраг|farmer|фермер/.test(t)) return ['Шраги в тренажёре', 'Тяга к лицу (face pull)'];
  return ['Тренажёрный аналог с опорой для спины'];
}
