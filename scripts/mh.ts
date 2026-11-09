// Парсер форматов MakeHuman (base.obj и .target). Запускается в Node (TypeScript без сборки).
import { readFileSync } from 'node:fs';

export interface ObjData {
  positions: Float64Array; // xyz для всех вершин base.obj (единицы MakeHuman = дециметры)
  groups: Map<string, number[][]>; // имя группы -> список граней (индексы вершин, 0-based)
}

export function parseObj(path: string): ObjData {
  const text = readFileSync(path, 'utf8');
  const pos: number[] = [];
  const groups = new Map<string, number[][]>();
  let current = 'default';
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/);
      pos.push(+x, +y, +z);
    } else if (line.startsWith('g ')) {
      current = line.slice(2).trim();
      if (!groups.has(current)) groups.set(current, []);
    } else if (line.startsWith('f ')) {
      const face = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((tok) => parseInt(tok.split('/')[0], 10) - 1);
      groups.get(current)!.push(face);
    }
  }
  return { positions: Float64Array.from(pos), groups };
}

/** Разреженный морф: индекс вершины -> смещение (дм). */
export type Target = Map<number, [number, number, number]>;

export function parseTarget(path: string): Target {
  const t: Target = new Map();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const [i, x, y, z] = line.trim().split(/\s+/);
    if (z === undefined) continue;
    t.set(parseInt(i, 10), [+x, +y, +z]);
  }
  return t;
}

export function applyTarget(positions: Float64Array, target: Target, weight: number): void {
  for (const [i, d] of target) {
    positions[i * 3] += d[0] * weight;
    positions[i * 3 + 1] += d[1] * weight;
    positions[i * 3 + 2] += d[2] * weight;
  }
}

/** Разность двух морфов a − b (оба относительно одной базы). */
export function diffTargets(a: Target, b: Target): Target {
  const out: Target = new Map();
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const k of keys) {
    const da = a.get(k) ?? [0, 0, 0];
    const db = b.get(k) ?? [0, 0, 0];
    out.set(k, [da[0] - db[0], da[1] - db[1], da[2] - db[2]]);
  }
  return out;
}

export function sumTargets(...ts: Target[]): Target {
  const out: Target = new Map();
  for (const t of ts)
    for (const [k, d] of t) {
      const o = out.get(k) ?? [0, 0, 0];
      out.set(k, [o[0] + d[0], o[1] + d[1], o[2] + d[2]]);
    }
  return out;
}
