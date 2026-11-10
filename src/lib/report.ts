// Мини-отчёт «что качать»: приоритеты для эстетики и силы, состав тела, объём, прогноз.
// Чистая функция над Derived — без React. Рекомендации — эвристика поверх расчётов приложения.
import type { Derived } from './derive';
import type { Settings, MeasureField } from './data/db';
import { activeFlags } from './health';
import type { RiskTag, Pattern, Muscle } from './hevy/exercises';
import { PATTERN_RU, MUSCLE_RU } from './hevy/exercises';
import { forecastAt, monthsToShare, type ForecastBase, type ForecastPoint } from './calc/forecast';
import { GOLDEN } from './calc/body';

export interface Ex {
  name: string;
  tags?: RiskTag[];
}

/** Упражнения-кандидаты по зонам; отфильтруются по ограничениям здоровья. */
const ZONE_EX: Record<string, Ex[]> = {
  shoulders: [{ name: 'Махи в стороны (гантели / блок)' }, { name: 'Махи в тренажёре' }, { name: 'Жим на плечи в тренажёре', tags: ['overhead'] }],
  rearDelts: [{ name: 'Разведения в тренажёре (reverse pec deck)' }, { name: 'Тяга к лицу' }],
  chest: [{ name: 'Жим от груди в тренажёре' }, { name: 'Жим гантелей на наклонной' }, { name: 'Бабочка / кроссовер' }],
  back: [{ name: 'Тяга верхнего блока' }, { name: 'Тяга с упором грудью' }, { name: 'Подтягивания' }],
  arms: [{ name: 'Сгибания на скамье Скотта' }, { name: 'Молотки' }, { name: 'Разгибания на блоке' }, { name: 'Французский жим', tags: ['overhead'] }],
  forearms: [{ name: 'Сгибания запястий', tags: ['wristLoad'] }, { name: 'Молотки' }, { name: 'Вис на турнике' }],
  neck: [{ name: 'Шраги в тренажёре' }, { name: 'Изометрия шеи с ладонью', tags: ['neckLoad'] }],
  thighs: [{ name: 'Жим ногами', tags: ['deepKnee'] }, { name: 'Гакк-присед', tags: ['deepKnee'] }, { name: 'Разгибания ног', tags: ['kneeShear'] }, { name: 'Сгибания ног' }],
  calves: [{ name: 'Подъёмы на носки стоя' }, { name: 'Подъёмы на носки сидя' }],
  glutes: [{ name: 'Ягодичный мост / hip thrust' }, { name: 'Отведение ноги назад в тренажёре' }],
  core: [{ name: 'Dead bug' }, { name: 'Pallof press' }, { name: 'Боковая планка' }],
};

const PATTERN_EX: Record<Pattern, Ex[]> = {
  hPush: [{ name: 'Жим от груди в тренажёре' }, { name: 'Жим гантелей лёжа' }],
  vPush: [{ name: 'Жим на плечи в тренажёре', tags: ['overhead'] }, { name: 'Жим гантелей сидя под углом 60–70°' }],
  squat: [{ name: 'Жим ногами', tags: ['deepKnee'] }, { name: 'Гакк-присед', tags: ['deepKnee'] }, { name: 'Присед с поясом (belt squat)' }],
  hinge: [{ name: 'Ягодичный мост / hip thrust' }, { name: 'Румынская тяга с гантелями', tags: ['axial'] }],
  hPull: [{ name: 'Тяга с упором грудью' }, { name: 'Тяга в тренажёре' }],
  vPull: [{ name: 'Тяга верхнего блока' }, { name: 'Подтягивания с весом' }],
  isolation: [],
  core: [],
  carry: [],
  cardio: [],
};

function safe(list: Ex[], s: Settings): string[] {
  const banned = new Set(activeFlags(s.healthFlags).flatMap((f) => f.tags));
  return list.filter((e) => !(e.tags ?? []).some((t) => banned.has(t))).map((e) => e.name);
}

export interface ZonePriority {
  zone: string;
  label: string;
  current: number;
  target: number;
  pct: number;
  gap: number;
  basis: string;
  sets: string;
  exercises: string[];
}

export interface Report {
  headline: string;
  zones: ZonePriority[];
  strength: Array<{ pattern: Pattern; label: string; exercise: string | null; score: number | null; exercises: string[] }>;
  volume: Array<{ muscle: string; sets: number }>;
  body: string[];
  forecast: { m6: ForecastPoint; m12: ForecastPoint; ceiling: ForecastPoint; half: number | null } | null;
  notes: string[];
}

const r1 = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');

export function buildReport(d: Derived, s: Settings): Report {
  const v = d.values;
  const butt = d.comp.butt;
  const reeves = d.comp.reevesIdeal;
  const zones: ZonePriority[] = [];
  // эстетика: цель = потенциал Casey Butt при 10 % жира (если есть), иначе пропорции Ривза
  const add = (zone: string, label: string, field: MeasureField, target: number | undefined, basis: string, setsZone: string, lowerIsBetter = false) => {
    const cur = v[field];
    if (!cur || !target) return;
    const pct = lowerIsBetter ? Math.min(100, (target / cur) * 100) : (cur / target) * 100;
    zones.push({ zone, label, current: cur, target, pct, gap: lowerIsBetter ? cur - target : target - cur, basis, sets: '', exercises: safe(ZONE_EX[setsZone] ?? [], s) });
  };
  add('arms', 'Руки (бицепс в напряжении)', 'bicepsFlexed', butt?.bicepsFlexed ?? reeves.bicepsFlexed, butt ? 'потенциал Butt' : 'Ривз', 'arms');
  add('chest', 'Грудь', 'chest', butt?.chest ?? reeves.chest, butt ? 'потенциал Butt' : 'Ривз', 'chest');
  add('thighs', 'Бёдра', 'thigh', butt?.thigh ?? reeves.thigh, butt ? 'потенциал Butt' : 'Ривз', 'thighs');
  add('calves', 'Голени', 'calf', butt?.calf ?? reeves.calf, butt ? 'потенциал Butt' : 'Ривз', 'calves');
  add('neck', 'Шея', 'neck', butt?.neck ?? reeves.neck, butt ? 'потенциал Butt' : 'Ривз', 'neck');
  add('forearms', 'Предплечья', 'forearm', butt?.forearm, 'потенциал Butt', 'forearms');
  // V-силуэт: плечи / талия → сколько не хватает плеч при текущей талии
  if (v.shoulders && v.waist) {
    const ideal = (s.sex === 'male' ? GOLDEN : 1.45) * v.waist;
    zones.push({
      zone: 'shoulders',
      label: 'Плечи (V-силуэт)',
      current: v.shoulders,
      target: ideal,
      pct: (v.shoulders / ideal) * 100,
      gap: ideal - v.shoulders,
      basis: `плечи/талия ${r1(v.shoulders / v.waist)} → ${s.sex === 'male' ? '1,618' : '1,45'}`,
      sets: '',
      exercises: [...safe(ZONE_EX.shoulders, s), ...safe(ZONE_EX.back, s).slice(0, 1)],
    });
  }
  // Талия — «меньше лучше»
  add('waist', 'Талия', 'waist', reeves.waist ?? (v.height ?? d.comp.heightCm) * 0.45, reeves.waist ? 'Ривз' : '0,45 × рост', 'core', true);
  zones.sort((a, b) => a.pct - b.pct);
  zones.forEach((z, i) => {
    z.sets = z.zone === 'waist' ? 'снижение жира + кор 2–3 подхода' : i < 2 ? '14–20 подходов в неделю (приоритет)' : '10–14 подходов в неделю';
  });

  // сила: слабые паттерны
  const pats: Pattern[] = ['hPush', 'vPush', 'squat', 'hinge', 'hPull', 'vPull'];
  const strength = pats
    .map((p) => ({ pattern: p, label: PATTERN_RU[p], exercise: d.patterns[p]?.exercise ?? null, score: d.patterns[p]?.score ?? null, exercises: safe(PATTERN_EX[p], s) }))
    .sort((a, b) => (a.score ?? -1) - (b.score ?? -1));

  // объём: мышцы ниже 10 подходов
  const volume = d.weekly.avg
    ? (Object.entries(d.weekly.avg) as Array<[Muscle, number]>).filter(([m, n]) => n < 10 && m !== 'neck' && m !== 'forearms').map(([m, n]) => ({ muscle: MUSCLE_RU[m] ?? m, sets: n })).sort((a, b) => a.sets - b.sets)
    : [];

  // состав тела
  const body: string[] = [];
  if (d.comp.bodyFat != null) {
    if (d.comp.bodyFat > s.goalBodyFat + 0.5) body.push(`Жир ${r1(d.comp.bodyFat)} % → цель ${s.goalBodyFat} %: рельеф и V-силуэт сильнее всего упираются в талию. Темп 0,5–1 % массы в неделю.`);
    else body.push(`Жир ${r1(d.comp.bodyFat)} % — в целевой зоне: можно переходить к набору 0,25–0,5 % массы в неделю (Iraki 2019).`);
  }
  if (d.targets) body.push(`Ккал ${d.targets.kcal}, белок ${d.targets.protein} г в день (${d.targets.proteinBasis}).`);
  if (d.comp.normFfmi != null) body.push(`Нормализованный FFMI ${r1(d.comp.normFfmi)} из ≈ ${s.sex === 'male' ? 25 : 21} возможных натурально.`);

  // прогноз
  let forecast: Report['forecast'] = null;
  if (v.weight && d.comp.bodyFat != null) {
    const base: ForecastBase = {
      sex: s.sex,
      heightCm: d.comp.heightCm,
      weight: v.weight,
      bodyFat: d.comp.bodyFat,
      values: v,
      trainingYears: s.trainingYears,
      goalBodyFat: s.goalBodyFat,
      cutRatePct: s.cutRatePct,
      butt,
    };
    forecast = { m6: forecastAt(base, 6), m12: forecastAt(base, 12), ceiling: forecastAt(base, 'ceiling'), half: monthsToShare(base, 0.5) };
  }

  const top = zones.filter((z) => z.zone !== 'waist').slice(0, 2).map((z) => z.label.toLowerCase());
  const weakPat = strength.find((x) => x.score != null);
  const headline = [
    `Уровень «${d.level.level}» (${Math.round(d.level.score)}/100).`,
    top.length ? `Главный приоритет для эстетики: ${top.join(' и ')}.` : 'Внесите замеры, чтобы определить отстающие зоны.',
    weakPat ? `Самое слабое движение: ${weakPat.label.toLowerCase()} (${Math.round(weakPat.score!)}/100).` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const notes = [
    'Цели по обхватам — эвристики (Casey Butt / Ривз), не исследования. Объём 10–20 подходов — Schoenfeld 2017; частота 2 раза в неделю — Schoenfeld 2016.',
    activeFlags(s.healthFlags).length ? 'Упражнения отфильтрованы по вашим ограничениям здоровья.' : '',
  ].filter(Boolean);

  return { headline, zones, strength, volume, body, forecast, notes };
}

/** Отчёт текстом — для копирования в заметки / ИИ. */
export function reportText(r: Report): string {
  const L: string[] = ['МИНИ-ОТЧЁТ «КАНОН»', r.headline, ''];
  L.push('ЭСТЕТИКА — приоритет зон (от отстающих):');
  r.zones.forEach((z, i) => L.push(`${i + 1}. ${z.label}: ${r1(z.current)} → ${r1(z.target)} см (${Math.round(z.pct)} %, ${z.basis}). ${z.sets}. ${z.exercises.slice(0, 3).join(', ')}`));
  L.push('', 'СИЛА — от слабого движения:');
  r.strength.forEach((p) => L.push(`- ${p.label}: ${p.exercise ? `${p.exercise}, ${Math.round(p.score!)}/100` : 'нет данных'}${p.exercises.length ? ` → ${p.exercises.slice(0, 2).join(', ')}` : ''}`));
  if (r.volume.length) L.push('', `ОБЪЁМ ниже 10 подходов/нед: ${r.volume.map((x) => `${x.muscle} ${r1(x.sets)}`).join(', ')}`);
  L.push('', 'СОСТАВ ТЕЛА:', ...r.body.map((b) => `- ${b}`));
  if (r.forecast) {
    const f = r.forecast;
    L.push('', `ПРОГНОЗ (модель): через 6 мес. ${r1(f.m6.weight)} кг, жир ${r1(f.m6.bodyFat)} %, FFMI ${r1(f.m6.normFfmi)}; через 12 мес. ${r1(f.m12.weight)} кг, жир ${r1(f.m12.bodyFat)} %, FFMI ${r1(f.m12.normFfmi)}; потолок FFMI ${r1(f.ceiling.normFfmi)}${f.half != null ? `, половина пути ≈ ${Math.round(f.half)} мес.` : ''}`);
  }
  L.push('', ...r.notes);
  return L.join('\n');
}
