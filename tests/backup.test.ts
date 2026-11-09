import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { KanonDB, saveSettings, loadSettings } from '../src/lib/data/db';
import { exportBackup, importBackup, canonical, validateBackup, BackupError, measurementsCsv, workoutsCsv } from '../src/lib/data/backup';
import { parseHevyWorkouts } from '../src/lib/hevy/hevy';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

async function seed(db: KanonDB) {
  await db.measurements.bulkAdd([
    { date: '2025-02-01', weight: 82.4, neck: 39, waist: 84, height: 180, note: 'утро, натощак' },
    { date: '2025-02-08', weight: 81.6, neck: 39, waist: 83, bicepsFlexed: 38.5 },
  ]);
  const sets = parseHevyWorkouts(readFileSync(resolve(__dirname, 'fixtures/hevy_workouts_kg.csv'), 'utf8')).rows;
  await db.sets.bulkPut(sets);
  await db.foods.add({ date: '2025-02-08', name: 'Творог 5 %', kcal: 242, protein: 34, fat: 10, carbs: 6, priceRub: 120, grams: 200 });
  await db.templates.add({ name: 'Овсянка', kcal: 350, protein: 12, fat: 6, carbs: 60, fiber: 8 });
  const bytes = new Uint8Array(256 * 1024);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) % 256;
  await db.photos.add({ date: '2025-02-08', angle: 'front', mime: 'image/jpeg', data: bytes.buffer });
  await db.exerciseOverrides.put({ title: 'Мой тренажёр', primary: ['back'], secondary: [] });
  await saveSettings({ goalWeightKg: 72, healthFlags: { hyperlordosis: true } }, db);
}

describe('Круговой бэкап', () => {
  it('экспорт → очистка → импорт → данные полностью совпадают (включая фото)', async () => {
    const db = new KanonDB('test-roundtrip');
    await seed(db);
    const before = await exportBackup(db);
    const json = JSON.stringify(before); // как в реальном файле
    for (const t of db.tables) await t.clear();
    expect(await db.measurements.count()).toBe(0);

    const counts = await importBackup(JSON.parse(json), db);
    expect(counts.sets).toBe(12);
    const after = await exportBackup(db);
    expect(canonical(after)).toBe(canonical(before));

    const photo = (await db.photos.toArray())[0];
    const arr = new Uint8Array(photo.data);
    expect(arr.length).toBe(256 * 1024);
    expect(arr[1000]).toBe((1000 * 31) % 256);
    expect((await loadSettings(db)).goalWeightKg).toBe(72);
    db.close();
  });

  it('импорт заменяет данные, а не дописывает (нет дублей)', async () => {
    const db = new KanonDB('test-replace');
    await seed(db);
    const b = await exportBackup(db);
    await importBackup(b, db);
    await importBackup(b, db);
    expect(await db.measurements.count()).toBe(2);
    expect(await db.sets.count()).toBe(12);
    db.close();
  });

  it('битый бэкап отклоняется, существующие данные не трогаются', async () => {
    const db = new KanonDB('test-bad');
    await seed(db);
    expect(() => validateBackup({ app: 'other' })).toThrow(BackupError);
    expect(() => validateBackup(null)).toThrow(BackupError);
    const good = await exportBackup(db);
    const broken = { ...good, data: { ...good.data, measurements: [{ id: 1, date: '2025-01-01' }, { id: 1, date: 'dup' }] } };
    await expect(importBackup(broken, db)).rejects.toThrow();
    expect(await db.measurements.count()).toBe(2); // транзакция откатилась
    expect(await db.sets.count()).toBe(12);
    db.close();
  });

  it('CSV-экспорт замеров и тренировок', async () => {
    const db = new KanonDB('test-csv');
    await seed(db);
    const m = measurementsCsv(await db.measurements.toArray());
    expect(m.split('\r\n')).toHaveLength(3);
    expect(m).toContain('82,4');
    const w = workoutsCsv(await db.sets.toArray());
    expect(w.split('\r\n')).toHaveLength(13);
    db.close();
  });
});
