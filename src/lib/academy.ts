// «Академия»: короткие статьи, собранные из той же проверенной базы, что и советы.
// Утверждения здесь не пишутся заново: каждое берётся по id из knowledge.json вместе со своими источниками
// (все источники проходят scripts/verify-sources.mjs). Свой текст — только вступление и практические шаги;
// в них нет чисел и фактов, которых нет в утверждениях ниже.
import { knowledge, type Evidence, type Source } from './advice/engine';
import { PROGRAM_SOURCES } from './program/generate';

export interface ArticleDef {
  id: string;
  title: string;
  /** одно предложение: о чём статья и кому она нужна */
  lead: string;
  /** id правил и эвристик из базы знаний */
  claims: string[];
  /** дополнительные утверждения с источниками, которых нет среди правил (ключ источника → формулировка) */
  extra?: Array<{ text: string; source: string }>;
  /** что делать: шаги без новых фактов */
  steps: string[];
  /** где это в приложении */
  link?: { href: string; label: string };
}

export const PROGRAM_CLAIMS: Record<(typeof PROGRAM_SOURCES)[number], string> = {
  schoenfeld2017: 'Объём: от 10 рабочих подходов на мышцу в неделю прирост больше, чем при меньшем объёме.',
  schoenfeld2016: 'Частота: каждая мышца — минимум два раза в неделю.',
  schoenfeld2017load: 'Повторы: мышцы растут в широком диапазоне повторов; для максимальной силы нужны тяжёлые веса.',
  schoenfeld2016rest: 'Отдых: три минуты между подходами дали больше силы и массы, чем одна.',
};

export const ARTICLES: ArticleDef[] = [
  {
    id: 'volume',
    title: 'Сколько подходов нужно мышце',
    lead: 'Про недельный объём и частоту — на этих правилах построен генератор программ.',
    claims: ['volume-low', 'volume-high', 'frequency-low'],
    extra: [
      { text: PROGRAM_CLAIMS.schoenfeld2017load, source: 'schoenfeld2017load' },
      { text: PROGRAM_CLAIMS.schoenfeld2016rest, source: 'schoenfeld2016rest' },
    ],
    steps: ['Посмотрите свой объём по мышцам: «Тренировки», раздел «Обзор».', 'Если мышца получает мало подходов — добавляйте понемногу, а не всё сразу.', 'Разнесите нагрузку на мышцу на два дня в неделю.'],
    link: { href: '#program', label: 'Программа' },
  },
  {
    id: 'cutting',
    title: 'Сушка без потери мышц',
    lead: 'Как худеть так, чтобы уходил жир, а сила оставалась.',
    claims: ['loss-too-fast', 'protein-low', 'strength-drop-cut', 'plateau'],
    steps: ['Следите за темпом по тренду веса, а не по одному взвешиванию.', 'Держите белок в целевом диапазоне приложения.', 'Если сила заметно падает — сначала проверьте темп и сон, потом программу.'],
    link: { href: '#food', label: 'Питание' },
  },
  {
    id: 'protein',
    title: 'Белок: сколько и как делить',
    lead: 'Откуда берётся цель по белку в приложении.',
    claims: ['protein-low', 'protein-distribution'],
    steps: ['Цель по белку смотрите в «Питании», раздел «Цели и как они посчитаны».', 'Распределяйте белок по приёмам пищи, а не съедайте всё вечером.'],
    link: { href: '#food', label: 'Питание' },
  },
  {
    id: 'bulking',
    title: 'Набор массы без лишнего жира',
    lead: 'Для тех, кто закончил сушку и хочет прибавлять.',
    claims: ['gain-too-fast', 'volume-low', 'ffmi-ceiling'],
    steps: ['Прибавляйте медленно и сверяйтесь с трендом веса.', 'В прогнозе приложения рост замедляется по мере приближения к потолку — это модель-эвристика, а не обещание.'],
    link: { href: '#home', label: 'Прогноз на «Сегодня»' },
  },
  {
    id: 'sleep',
    title: 'Сон и сила',
    lead: 'Почему приложение спрашивает про сон.',
    claims: ['sleep-low', 'strength-drop-cut'],
    steps: ['Записывайте сон хотя бы две недели: «Статистика», раздел «Сон и шаги».', 'Если сна мало, а силовые стоят — начните с режима сна.'],
    link: { href: '#stats', label: 'Статистика' },
  },
  {
    id: 'health',
    title: 'Талия, клетчатка и взвешивания',
    lead: 'Три простых показателя здоровья, которые приложение считает само.',
    claims: ['whtr-high', 'fiber-low', 'weigh-in-rare'],
    steps: ['Мерьте талию на уровне пупка раз в неделю.', 'Смотрите клетчатку в дневнике питания.', 'Взвешивайтесь регулярно, по утрам, в одних условиях.'],
    link: { href: '#measure', label: 'Тело' },
  },
  {
    id: 'back',
    title: 'Спина и ограничения',
    lead: 'Что стоит за пометками упражнений при проблемах со спиной.',
    claims: ['lordosis-axial', 'health-flags', 'push-pull'],
    steps: ['Отметьте ограничения в настройках — программа и пометки учтут их.', 'При боли, онемении или головокружении прекратите упражнение и обратитесь к врачу.'],
    link: { href: '#settings', label: 'Настройки' },
  },
  {
    id: 'heuristics',
    title: 'Что в приложении не наука',
    lead: 'Ориентиры, которые удобны, но не доказаны исследованиями. Приложение помечает их как эвристики.',
    claims: ['lagging-zone', 'v-taper', 'deload', 'ffmi-ceiling'],
    steps: ['Относитесь к уровню, пропорциям и срокам как к ориентирам, а не к обещаниям.', 'Решения о питании и нагрузке сверяйте с разделами, где есть источники.'],
    link: { href: '#advice', label: 'Советы' },
  },
];

export interface ArticleClaim {
  text: string;
  /** null — эвристика без исследований */
  evidence: Evidence | null;
  uncertain: boolean;
  note?: string;
  sources: Source[];
}

export interface Article extends Omit<ArticleDef, 'claims' | 'extra'> {
  claims: ArticleClaim[];
}

const EXTRA_EVIDENCE: Record<string, Evidence> = { 'meta-analysis': 'meta-analysis', 'systematic-review': 'systematic-review', rct: 'rct', observational: 'observational', review: 'review', consensus: 'consensus' };

export function buildArticles(): Article[] {
  return ARTICLES.map((a) => {
    const claims: ArticleClaim[] = [];
    for (const id of a.claims) {
      const rule = knowledge.rules.find((r) => r.id === id);
      if (rule) {
        claims.push({ text: rule.claim, evidence: rule.evidence, uncertain: !!rule.uncertain, sources: rule.sources.map((k) => knowledge.sources[k]) });
        continue;
      }
      const h = knowledge.heuristics.find((x) => x.id === id);
      if (h) claims.push({ text: h.claim, evidence: null, uncertain: false, note: h.note, sources: [] });
    }
    for (const e of a.extra ?? []) {
      const s = knowledge.sources[e.source];
      claims.push({ text: e.text, evidence: EXTRA_EVIDENCE[s.type.toLowerCase()] ?? null, uncertain: false, sources: [s] });
    }
    return { id: a.id, title: a.title, lead: a.lead, steps: a.steps, link: a.link, claims };
  });
}
