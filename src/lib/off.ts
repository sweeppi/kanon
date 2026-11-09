// Поиск продуктов в Open Food Facts (бесплатно, без ключа). Данные — ODbL, нужна атрибуция.
// Цепочка: штрихкод → ru.openfoodfacts.org (русская выдача) → world.openfoodfacts.org. Если всё недоступно — ручной ввод.
// search.openfoodfacts.org не используем: на 09.11.2026 он не отдавал CORS-заголовок и браузер блокировал ответ.

export interface OffProduct {
  code: string;
  name: string;
  brand: string;
  per100: { kcal: number; protein: number; fat: number; carbs: number; fiber?: number; sugar?: number };
}

type Nutr = Record<string, number | string | undefined>;
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN);

export function mapProduct(p: { code?: string; product_name?: string; product_name_ru?: string; brands?: string | string[]; nutriments?: Nutr }): OffProduct | null {
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (!Number.isFinite(kcal)) kcal = num(n['energy_100g']) / 4.184;
  const protein = num(n['proteins_100g']);
  if (!Number.isFinite(kcal) || !Number.isFinite(protein)) return null;
  const name = (p.product_name_ru || p.product_name || '').trim();
  if (!name) return null;
  const fiber = num(n['fiber_100g']);
  const sugar = num(n['sugars_100g']);
  return {
    code: p.code ?? '',
    name,
    brand: Array.isArray(p.brands) ? p.brands.join(', ') : (p.brands ?? ''),
    per100: {
      kcal: Math.round(kcal),
      protein,
      fat: num(n['fat_100g']) || 0,
      carbs: num(n['carbohydrates_100g']) || 0,
      fiber: Number.isFinite(fiber) ? fiber : undefined,
      sugar: Number.isFinite(sugar) ? sugar : undefined,
    },
  };
}

const FIELDS = 'code,product_name,product_name_ru,brands,nutriments';

async function getJson(url: string, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function searchOff(q: string): Promise<OffProduct[]> {
  const query = q.trim();
  if (!query) return [];
  const errors: string[] = [];
  if (/^\d{8,14}$/.test(query)) {
    try {
      const j = await getJson(`https://world.openfoodfacts.org/api/v2/product/${query}.json?fields=${FIELDS}`);
      const p = j.product ? mapProduct({ ...j.product, code: query }) : null;
      return p ? [p] : [];
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  for (const host of ['ru', 'world']) {
    try {
      const j = await getJson(
        `https://${host}.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`,
      );
      const hits = (j.products ?? []).map(mapProduct).filter(Boolean) as OffProduct[];
      if (hits.length) return hits;
    } catch (e) {
      errors.push(`${host}: ${(e as Error).message}`);
    }
  }
  if (!errors.length) return [];
  throw new Error(`Open Food Facts недоступен (${errors.join('; ')}). Введите продукт вручную.`);
}
