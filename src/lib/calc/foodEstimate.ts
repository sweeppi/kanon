// Оценка клетчатки и сахара, когда их нет на этикетке/в импорте.
// Приближение по категории продукта: доли от углеводов. Типичные соотношения для групп продуктов
// (ориентир по таблицам состава USDA/Скурихина, округлено). Показывается в интерфейсе как «≈ оценка».

export interface CarbProfile {
  category: string;
  /** клетчатка / углеводы */
  fiber: number;
  /** сахара / углеводы */
  sugar: number;
}

const CATS: Array<[RegExp, CarbProfile]> = [
// Порядок важен: сначала источники углеводов (в смешанном блюде «курица с рисом» углеводы — от риса), затем молочное и мясо.
  [/фасол|чечевиц|нут|горох|бобов|соя|эдамам|bean|lentil|chickpea/, { category: 'бобовые', fiber: 0.3, sugar: 0.05 }],
  [/брокколи|капуст|огур|помидор|томат|перец|кабачок|баклажан|шпинат|салат|морков|свекл|лук|чеснок|зелень|овощ|vegetable|broccoli|spinach|cucumber|tomato/, { category: 'овощи', fiber: 0.35, sugar: 0.4 }],
  [/ягод|малин|черник|клубник|смородин|berry|berries/, { category: 'ягоды', fiber: 0.3, sugar: 0.55 }],
  [/яблок|банан|груш|апельсин|мандарин|киви|виноград|фрукт|персик|слив|ананас|манго|apple|banana|orange|fruit|grape/, { category: 'фрукты', fiber: 0.12, sugar: 0.75 }],
  [/орех|миндал|арахис|кешью|фундук|семечк|семен|chia|чиа|almond|peanut|nut/, { category: 'орехи/семена', fiber: 0.4, sugar: 0.2 }],
  [/овсян|гречк|бурый рис|киноа|перловк|булгур|цельнозерн|отруб|oat|buckwheat|quinoa|whole ?grain|bran/, { category: 'цельные крупы', fiber: 0.15, sugar: 0.02 }],
  [/рис|макарон|паст|спагетти|лапш|кускус|манк|rice|pasta|noodle/, { category: 'крупы/макароны', fiber: 0.04, sugar: 0.02 }],
  [/хлеб|батон|лаваш|булк|тост|bread|toast|bagel/, { category: 'хлеб', fiber: 0.06, sugar: 0.08 }],
  [/картоф|батат|potato/, { category: 'картофель', fiber: 0.1, sugar: 0.05 }],
  [/шоколад|конфет|печень|торт|пирожн|мороженое|сладк|сахар|мёд|мед(?![а-яё])|варенье|газировк|кола|сок|chocolate|candy|cookie|cake|ice cream|soda|juice|honey/, { category: 'сладкое/напитки', fiber: 0.03, sugar: 0.7 }],
  [/протеин|protein|батончик|bar\b/, { category: 'протеин/батончики', fiber: 0.1, sugar: 0.35 }],
  [/творог|йогурт|кефир|молок|ряженк|сыр(ок)?\b|сливк|скир|milk|yogurt|cottage|kefir/, { category: 'молочное', fiber: 0, sugar: 0.9 }],
  [/куриц|курин|индейк|говяд|свинин|мяс|фарш|рыб|лосос|тунец|минта|треск|креветк|яйц|омлет|chicken|beef|pork|fish|salmon|tuna|egg/, { category: 'мясо/рыба/яйца', fiber: 0, sugar: 0.3 }],
];
const DEFAULT: CarbProfile = { category: 'смешанное блюдо', fiber: 0.08, sugar: 0.25 };

export function carbProfile(name: string): CarbProfile {
  const n = name.toLowerCase().replace(/ё/g, 'е');
  for (const [re, p] of CATS) if (re.test(n)) return p;
  return DEFAULT;
}

export interface FiberSugar {
  fiber: number;
  sugar: number;
  fiberEstimated: boolean;
  sugarEstimated: boolean;
  category: string;
}

/** Если клетчатка/сахар не заданы — оцениваем по углеводам и категории продукта. */
export function estimateFiberSugar(name: string, carbs: number, fiber?: number | null, sugar?: number | null): FiberSugar {
  const p = carbProfile(name);
  const c = Math.max(0, carbs || 0);
  return {
    fiber: fiber ?? Math.round(c * p.fiber * 10) / 10,
    sugar: sugar ?? Math.round(c * p.sugar * 10) / 10,
    fiberEstimated: fiber == null,
    sugarEstimated: sugar == null,
    category: p.category,
  };
}
