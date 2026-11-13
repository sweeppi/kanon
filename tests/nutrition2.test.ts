// Этап 4: «Спросить ИИ» про еду, штрихкоды, вода. Данные вымышленные.
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { buildFoodPrompt, parseAiFood, extractJson } from '../src/lib/aiFood';
import { KanonDB } from '../src/lib/data/db';
import { exportBackup, importBackup, canonical } from '../src/lib/data/backup';
import { addWater } from '../src/lib/water';

// barcode.ts тянет .wasm через сборщик, поэтому чистые функции проверяем по той же формуле отдельно импортом
import { isValidEan, pickEan } from '../src/lib/ean';

describe('Запрос для ИИ', () => {
  it('содержит описание и требование ответить JSON на всю порцию', () => {
    const p = buildFoodPrompt('  тарелка борща и два куска хлеба ');
    expect(p).toContain('Описание: тарелка борща и два куска хлеба');
    expect(p).toContain('НА ВСЮ ПОРЦИЮ');
    expect(p).toContain('"items"');
  });
  it('без описания просит смотреть фото', () => {
    expect(buildFoodPrompt('')).toContain('фото');
  });
});

describe('Разбор ответа ИИ', () => {
  it('чистый JSON', () => {
    const r = parseAiFood('{"items":[{"name":"Борщ","grams":300,"kcal":180,"protein":8,"fat":7,"carbs":21}],"note":"сметана не учтена"}');
    expect(r.errors).toEqual([]);
    expect(r.note).toBe('сметана не учтена');
    expect(r.items).toEqual([{ name: 'Борщ', grams: 300, kcal: 180, protein: 8, fat: 7, carbs: 21, warnings: [] }]);
  });

  it('JSON внутри текста и ```-блока, числа строками с запятой и единицами', () => {
    const r = parseAiFood('Вот оценка:\n```json\n{"items":[{"name":"Хлеб","grams":"60 г","kcal":"150","protein":"4,8","fat":"0,6","carbs":"30"}]}\n```\nПриятного аппетита!');
    expect(r.errors).toEqual([]);
    expect(r.items[0]).toMatchObject({ name: 'Хлеб', grams: 60, kcal: 150, protein: 4.8, fat: 0.6, carbs: 30 });
  });

  it('массив без обёртки и русские ключи', () => {
    const r = parseAiFood('[{"название":"Каша","ккал":210,"белки":7,"жиры":4,"углеводы":36}]');
    expect(r.items).toHaveLength(1);
    expect(r.items[0].grams).toBeUndefined();
  });

  it('предупреждает, если калории не сходятся с БЖУ', () => {
    const r = parseAiFood('{"items":[{"name":"Странное блюдо","kcal":900,"protein":10,"fat":10,"carbs":10}]}');
    expect(r.items[0].warnings[0]).toContain('не сходятся');
    const ok = parseAiFood('{"items":[{"name":"Курица","kcal":165,"protein":31,"fat":3.6,"carbs":0}]}');
    expect(ok.items[0].warnings).toEqual([]);
  });

  it('плохие позиции отбрасываются с объяснением, хорошие остаются', () => {
    const r = parseAiFood('{"items":[{"name":"","kcal":100,"protein":1,"fat":1,"carbs":1},{"name":"Без калорий","protein":1,"fat":1,"carbs":1},{"name":"Слон","kcal":999999,"protein":1,"fat":1,"carbs":1},{"name":"Яблоко","kcal":80,"protein":0.4,"fat":0.3,"carbs":19}]}');
    expect(r.items.map((x) => x.name)).toEqual(['Яблоко']);
    expect(r.errors).toHaveLength(3);
  });

  it('не JSON, пустой ответ, нет items — понятная ошибка и ни одной позиции', () => {
    expect(parseAiFood('В борще примерно 180 ккал.').errors[0]).toContain('не найден JSON');
    expect(parseAiFood('   ').errors[0]).toContain('пустой');
    expect(parseAiFood('{"total":500}').errors[0]).toContain('items');
    expect(parseAiFood('{"items":[]}').errors[0]).toContain('пустой');
    expect(extractJson('нет скобок')).toBeUndefined();
  });
});

describe('Штрихкоды', () => {
  it('контрольная цифра EAN-13, EAN-8 и UPC-A', () => {
    expect(isValidEan('4006381333931')).toBe(true); // пример из описания стандарта EAN-13
    expect(isValidEan('4006381333932')).toBe(false);
    expect(isValidEan('73513537')).toBe(true); // EAN-8
    expect(isValidEan('036000291452')).toBe(true); // UPC-A
    expect(isValidEan('12345')).toBe(false);
    expect(isValidEan('40063813339ab')).toBe(false);
  });
  it('из нескольких прочитанных строк берётся первый верный код', () => {
    expect(pickEan(['4006381333932', ' 4006381333931 ', '73513537'])).toBe('4006381333931');
    expect(pickEan(['abc', ''])).toBeNull();
  });
});

describe('Вода', () => {
  it('прибавление и отмена не уходят ниже нуля и выше разумного предела', () => {
    expect(addWater(0, 250)).toBe(250);
    expect(addWater(250, -500)).toBe(0);
    expect(addWater(9900, 500)).toBe(10000);
  });

  it('записи воды попадают в бэкап и восстанавливаются', async () => {
    const db = new KanonDB('test-water');
    await db.water.put({ date: '2025-03-01', ml: 1750 });
    await db.water.put({ date: '2025-03-02', ml: 500 });
    const before = await exportBackup(db);
    await db.water.clear();
    await importBackup(JSON.parse(JSON.stringify(before)), db);
    expect((await db.water.get('2025-03-01'))!.ml).toBe(1750);
    expect(canonical(await exportBackup(db))).toBe(canonical(before));
    db.close();
  });
});
