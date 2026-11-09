// Полный бэкап в JSON и восстановление. Фото (ArrayBuffer) кодируются в base64.
import { TABLES, getDb, type KanonDB, type TableName, type Measurement } from './db';
import type { WorkoutSet } from '../hevy/hevy';
import { toCsv } from '../hevy/csv';

export const BACKUP_APP = 'kanon-body-tracker';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  data: Record<TableName, unknown[]>;
}

export function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}
export function b64ToBuf(b64: string): ArrayBuffer {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

export async function exportBackup(db: KanonDB = getDb()): Promise<BackupFile> {
  const data = {} as Record<TableName, unknown[]>;
  await db.transaction('r', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      const rows = await db.table(t).toArray();
      data[t] =
        t === 'photos'
          ? rows.map((p: { data: ArrayBuffer }) => ({ ...p, data: bufToB64(p.data) }))
          : rows;
    }
  });
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

export class BackupError extends Error {}

export function validateBackup(obj: unknown): BackupFile {
  if (!obj || typeof obj !== 'object') throw new BackupError('Файл не является JSON-объектом');
  const b = obj as Partial<BackupFile>;
  if (b.app !== BACKUP_APP) throw new BackupError('Это не бэкап приложения «Канон»');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION)
    throw new BackupError(`Версия бэкапа ${b.version} не поддерживается — обновите приложение`);
  if (!b.data || typeof b.data !== 'object') throw new BackupError('В бэкапе нет данных');
  for (const t of TABLES) if (b.data[t] !== undefined && !Array.isArray(b.data[t])) throw new BackupError(`Повреждена таблица ${t}`);
  return b as BackupFile;
}

/** Полная замена данных содержимым бэкапа (атомарно: при ошибке ничего не меняется). */
export async function importBackup(file: BackupFile, db: KanonDB = getDb()): Promise<Record<TableName, number>> {
  const b = validateBackup(file);
  const counts = {} as Record<TableName, number>;
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      const rows = (b.data[t] ?? []) as Array<Record<string, unknown>>;
      const prepared = t === 'photos' ? rows.map((p) => ({ ...p, data: b64ToBuf(p.data as string) })) : rows;
      await db.table(t).clear();
      if (prepared.length) await db.table(t).bulkAdd(prepared);
      counts[t] = prepared.length;
    }
  });
  return counts;
}

/** Канонический JSON для сравнения двух бэкапов (без даты экспорта, с сортировкой строк). */
export function canonical(b: BackupFile): string {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows = [...((b.data[t] ?? []) as unknown[])].map((r) => JSON.stringify(sortKeys(r)));
    rows.sort();
    data[t] = rows;
  }
  return JSON.stringify(data);
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  return v;
}

// ---------- CSV ----------
import { MEASURE_FIELDS } from './db';
export const MEASURE_LABELS: Record<string, string> = {
  date: 'Дата',
  weight: 'Вес, кг',
  bodyFatInput: 'Жир (весы/калипер), %',
  height: 'Рост, см',
  neck: 'Шея',
  shoulders: 'Плечи (дельты)',
  chest: 'Грудь',
  waist: 'Талия (пупок)',
  hips: 'Таз',
  thigh: 'Бедро',
  knee: 'Колено',
  calf: 'Голень',
  ankle: 'Лодыжка',
  bicepsFlexed: 'Бицепс в напряжении',
  bicepsRelaxed: 'Бицепс расслабл.',
  forearm: 'Предплечье',
  wrist: 'Запястье',
  note: 'Заметка',
};

export function measurementsCsv(rows: Measurement[]): string {
  const cols = ['date', ...MEASURE_FIELDS, 'note'] as const;
  return toCsv([
    cols.map((c) => MEASURE_LABELS[c]),
    ...[...rows].sort((a, b) => a.date.localeCompare(b.date)).map((r) => cols.map((c) => (r as Record<string, string | number | undefined>)[c] ?? '')),
  ]);
}

export function workoutsCsv(rows: WorkoutSet[]): string {
  const cols: Array<keyof WorkoutSet> = ['start', 'title', 'exercise', 'setIndex', 'setType', 'weightKg', 'reps', 'rpe', 'distanceKm', 'durationSec', 'notes'];
  const head = ['Начало', 'Тренировка', 'Упражнение', '№ подхода', 'Тип', 'Вес, кг', 'Повторы', 'RPE', 'Дистанция, км', 'Длительность, с', 'Заметки'];
  return toCsv([head, ...[...rows].sort((a, b) => a.key.localeCompare(b.key)).map((r) => cols.map((c) => r[c] as string | number | null))]);
}

/** Скачивание файла в браузере (на iOS откроется лист «Поделиться/Сохранить в Файлы»). */
export function downloadFile(name: string, content: string | Blob, mime = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
