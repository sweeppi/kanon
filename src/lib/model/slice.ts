// Чистые функции геометрии: сечение треугольной сетки плоскостью и «обхват лентой».
// Без зависимостей — модуль используется и в браузере, и в Node-скрипте сборки модели.

export type Vec3 = [number, number, number];

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));

/** Выпуклая оболочка набора 2D-точек (алгоритм Эндрю, monotone chain), против часовой стрелки. */
export function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  if (points.length < 3) return [...points];
  const pts = [...points].sort((p, q) => (p[0] === q[0] ? p[1] - q[1] : p[0] - q[0]));
  const crossZ = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of pts) {
    while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Периметр выпуклой оболочки набора 2D-точек. */
export function convexHullPerimeter(points: Array<[number, number]>): number {
  if (points.length < 2) return 0;
  const hull = convexHull(points);
  if (hull.length === 1) return 0;
  let per = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    per += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return per;
}

export interface Plane {
  origin: Vec3;
  normal: Vec3; // единичный
}

/**
 * Точки пересечения рёбер треугольников с плоскостью, в 2D-координатах плоскости.
 * getPos(i) возвращает позицию вершины i (уже с учётом морфов).
 * maxRadius отсекает дальние куски (например, другую часть тела в той же плоскости).
 */
/** Ортонормированный базис плоскости: u ⟂ n, v = n × u. */
export function planeBasis(normal: Vec3): { n: Vec3; u: Vec3; v: Vec3 } {
  const n = norm(normal);
  const helper: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(helper, n));
  return { n, u, v: cross(n, u) };
}

export function sectionPoints(
  triangles: ArrayLike<number>,
  getPos: (i: number) => Vec3,
  plane: Plane,
  maxRadius = Infinity,
  keep?: (p: Vec3) => boolean,
): Array<[number, number]> {
  const { n, u, v } = planeBasis(plane.normal);
  const out: Array<[number, number]> = [];
  const cache = new Map<number, number>();
  const dist = (i: number) => {
    let d = cache.get(i);
    if (d === undefined) {
      d = dot(sub(getPos(i), plane.origin), n);
      cache.set(i, d);
    }
    return d;
  };
  const pushPoint = (p: Vec3) => {
    const r = sub(p, plane.origin);
    if (len(r) > maxRadius) return;
    if (keep && !keep(p)) return;
    out.push([dot(r, u), dot(r, v)]);
  };
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const ids = [triangles[t], triangles[t + 1], triangles[t + 2]];
    for (let e = 0; e < 3; e++) {
      const a = ids[e];
      const b = ids[(e + 1) % 3];
      const da = dist(a);
      const db = dist(b);
      if ((da < 0 && db >= 0) || (da >= 0 && db < 0)) {
        const k = da / (da - db);
        pushPoint(lerp(getPos(a), getPos(b), k));
      }
    }
  }
  return out;
}

/** Обхват «лентой» = периметр выпуклой оболочки сечения (лента не заходит во впадины). */
export function tapeCircumference(
  triangles: ArrayLike<number>,
  getPos: (i: number) => Vec3,
  plane: Plane,
  maxRadius = Infinity,
  keep?: (p: Vec3) => boolean,
): number {
  return convexHullPerimeter(sectionPoints(triangles, getPos, plane, maxRadius, keep));
}
