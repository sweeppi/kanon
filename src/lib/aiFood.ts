// «Спросить ИИ» про еду без платного API: приложение готовит запрос, пользователь сам вставляет его
// в свой чат (Claude, Gemini и т. п.), при желании прикладывает фото, а ответ вставляет обратно.
// Здесь — только текст запроса и разбор ответа. В сеть приложение ничего не отправляет.

export interface AiFoodItem {
  name: string;
  grams?: number;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  /** предупреждения по этой позиции (например, калории не сходятся с БЖУ) */
  warnings: string[];
}

export interface AiFoodResult {
  items: AiFoodItem[];
  /** пояснение модели, если она его дала */
  note: string;
  /** почему часть ответа не разобрана */
  errors: string[];
}

export function buildFoodPrompt(description: string): string {
  const d = description.trim();
  return [
    'Оцени калорийность и БЖУ того, что я съел.',
    d ? `Описание: ${d}` : 'Описание: смотри фото, которое я приложу к этому сообщению.',
    '',
    'Правила:',
    '1. Раздели еду на отдельные позиции (блюдо, гарнир, напиток, соус).',
    '2. Для каждой позиции оцени вес порции в граммах и значения НА ВСЮ ПОРЦИЮ, а не на 100 г.',
    '3. Если точных данных нет — дай лучшую оценку и коротко скажи в поле note, в чём не уверен.',
    '4. Ответь ТОЛЬКО одним блоком JSON без текста до и после, строго в таком виде:',
    '{"items":[{"name":"Название по-русски","grams":150,"kcal":250,"protein":20,"fat":10,"carbs":15}],"note":"что оценено приблизительно"}',
    '5. Числа — без единиц измерения, десятичный разделитель — точка.',
  ].join('\n');
}

const toNum = (v: unknown): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const m = v.replace(',', '.').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  }
  return NaN;
};

/** Достаёт из произвольного текста первый JSON-объект или массив: модель может добавить пояснения или ```-блок. */
export function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, '');
  // начинаем с той скобки, что встретилась раньше: у массива «[{…}]» иначе вытащился бы один вложенный объект
  const kinds = ([['{', '}'], ['[', ']']] as const).filter(([open]) => t.includes(open)).sort((x, y) => t.indexOf(x[0]) - t.indexOf(y[0]));
  for (const [open, close] of kinds) {
    const a = t.indexOf(open);
    const b = t.lastIndexOf(close);
    if (a < 0 || b <= a) continue;
    try {
      return JSON.parse(t.slice(a, b + 1));
    } catch {
      /* пробуем другой вид скобок */
    }
  }
  return undefined;
}

const pick = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

export function parseAiFood(text: string): AiFoodResult {
  const res: AiFoodResult = { items: [], note: '', errors: [] };
  if (!text.trim()) {
    res.errors.push('Ответ пустой — вставьте текст, который вернул ИИ.');
    return res;
  }
  const json = extractJson(text);
  if (json === undefined) {
    res.errors.push('В ответе не найден JSON. Попросите ИИ ответить строго в формате из запроса.');
    return res;
  }
  const root = json as Record<string, unknown>;
  const list = Array.isArray(json) ? json : Array.isArray(root.items) ? root.items : null;
  if (!list) {
    res.errors.push('В JSON нет списка items.');
    return res;
  }
  if (!Array.isArray(json) && typeof root.note === 'string') res.note = root.note.trim();

  list.forEach((raw, i) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const name = String(pick(o, ['name', 'название', 'title']) ?? '').trim();
    const kcal = toNum(pick(o, ['kcal', 'calories', 'ккал']));
    const protein = toNum(pick(o, ['protein', 'proteins', 'белки', 'белок']));
    const fat = toNum(pick(o, ['fat', 'fats', 'жиры']));
    const carbs = toNum(pick(o, ['carbs', 'carbohydrates', 'углеводы']));
    const grams = toNum(pick(o, ['grams', 'weight', 'г', 'вес']));
    const n = i + 1;
    if (!name) return void res.errors.push(`Позиция ${n}: нет названия.`);
    if (![kcal, protein, fat, carbs].every(Number.isFinite)) return void res.errors.push(`«${name}»: не хватает калорий или БЖУ.`);
    if (kcal < 0 || kcal > 5000 || [protein, fat, carbs].some((x) => x < 0 || x > 500)) return void res.errors.push(`«${name}»: значения вне разумных пределов.`);
    const warnings: string[] = [];
    const byMacros = protein * 4 + fat * 9 + carbs * 4;
    // спирт и клетчатка дают расхождение, поэтому порог мягкий: 25 % и не меньше 40 ккал
    if (Math.abs(byMacros - kcal) > Math.max(40, kcal * 0.25)) warnings.push(`калории (${Math.round(kcal)}) не сходятся с БЖУ (≈ ${Math.round(byMacros)})`);
    res.items.push({
      name,
      grams: Number.isFinite(grams) && grams > 0 && grams <= 5000 ? Math.round(grams) : undefined,
      kcal: Math.round(kcal),
      protein: +protein.toFixed(1),
      fat: +fat.toFixed(1),
      carbs: +carbs.toFixed(1),
      warnings,
    });
  });
  if (!res.items.length && !res.errors.length) res.errors.push('Список позиций пустой.');
  return res;
}
