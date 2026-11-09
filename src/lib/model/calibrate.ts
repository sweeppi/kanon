// Калибровка морфов под замеры пользователя. Чистые функции над массивами — тестируются без WebGL.
//
// Идея: обхват модели = периметр выпуклой оболочки сечения меша плоскостью (как лента).
// Для каждого замера есть «свой» морф (incr/decr). Подбираем его параметр бисекцией,
// повторяя несколько кругов (координатный спуск), т. к. морфы слегка влияют друг на друга.
import { tapeCircumference, lerp, sub, norm, type Vec3 } from './slice';
import { MORPH_PARAMS, type MorphParam, type SliceDef, type SliceKey, type Landmarks } from './schema';

export interface Rig {
  nv: number;
  /** базовые позиции, м, мировые координаты */
  base: Float32Array;
  /** дельты морфов по индексу в landmarks.morphNames */
  deltas: Float32Array[];
  index: ArrayLike<number>;
  segId: ArrayLike<number>;
  lm: Landmarks;
  /** предвычисленные треугольники для каждого сечения */
  sliceTris: Map<SliceKey, Uint32Array>;
}

export type Params = Partial<Record<MorphParam, number>>;

/** Пределы параметров: ±1 — родной диапазон MakeHuman; дальше — экстраполяция (помечаем). */
export const PARAM_LIMIT = 1.6;
export const NATIVE_LIMIT = 1;

export function buildRig(base: Float32Array, deltas: Float32Array[], index: ArrayLike<number>, segId: ArrayLike<number>, lm: Landmarks): Rig {
  const nv = base.length / 3;
  const sliceTris = new Map<SliceKey, Uint32Array>();
  const zeroW = new Float32Array(lm.morphNames.length);
  for (const s of lm.slices) {
    const segs = new Set(s.segs ?? []);
    const plane = slicePlane(lm, s, zeroW);
    const out: number[] = [];
    for (let t = 0; t + 2 < index.length; t += 3) {
      const a = index[t];
      const b = index[t + 1];
      const c = index[t + 2];
      if (!segs.has(segId[a]) || !segs.has(segId[b]) || !segs.has(segId[c])) continue;
      // предфильтр: треугольник в пределах 12 см от плоскости в базовой позе (морфы двигают меньше)
      let near = false;
      for (const v of [a, b, c]) {
        const d =
          (base[v * 3] - plane.origin[0]) * plane.normal[0] +
          (base[v * 3 + 1] - plane.origin[1]) * plane.normal[1] +
          (base[v * 3 + 2] - plane.origin[2]) * plane.normal[2];
        if (Math.abs(d) < 0.12) near = true;
      }
      if (near) out.push(a, b, c);
    }
    sliceTris.set(s.key, Uint32Array.from(out));
  }
  // Верх/низ ищем по геометрии, а не берём индексы из landmarks: сжатие meshopt переупорядочивает вершины.
  let top = 0;
  let bottom = 0;
  for (let i = 0; i < nv; i++) {
    if (base[i * 3 + 1] > base[top * 3 + 1]) top = i;
    if (base[i * 3 + 1] < base[bottom * 3 + 1]) bottom = i;
  }
  return { nv, base, deltas, index, segId, lm: { ...lm, top, bottom }, sliceTris };
}

/** Параметры → веса morph targets (по порядку lm.morphNames). */
export function paramsToWeights(params: Params, morphNames: string[]): Float32Array {
  const w = new Float32Array(morphNames.length);
  for (const p of MORPH_PARAMS) {
    const v = params[p] ?? 0;
    if (v === 0) continue;
    const name = `${p}_${v > 0 ? 'incr' : 'decr'}`;
    const i = morphNames.indexOf(name);
    if (i >= 0) w[i] = Math.abs(v);
  }
  return w;
}

export function pointAt(lm: Landmarks, name: string, w: Float32Array): Vec3 {
  const p = lm.points[name];
  const out: Vec3 = [p.base[0], p.base[1], p.base[2]];
  for (const [k, d] of Object.entries(p.d)) {
    const wk = w[+k];
    if (!wk) continue;
    out[0] += d[0] * wk;
    out[1] += d[1] * wk;
    out[2] += d[2] * wk;
  }
  return out;
}

export function slicePlane(lm: Landmarks, s: SliceDef, w: Float32Array) {
  const A = pointAt(lm, s.a, w);
  const B = pointAt(lm, s.b, w);
  const origin = lerp(A, B, s.t);
  const normal: Vec3 = s.normal === 'up' ? [0, 1, 0] : norm(sub(B, A));
  return { origin, normal };
}

export function vertexGetter(rig: Rig, w: Float32Array): (i: number) => Vec3 {
  const active: Array<[Float32Array, number]> = [];
  w.forEach((wk, k) => {
    if (wk) active.push([rig.deltas[k], wk]);
  });
  const b = rig.base;
  return (i: number): Vec3 => {
    let x = b[i * 3];
    let y = b[i * 3 + 1];
    let z = b[i * 3 + 2];
    for (const [d, wk] of active) {
      x += d[i * 3] * wk;
      y += d[i * 3 + 1] * wk;
      z += d[i * 3 + 2] * wk;
    }
    return [x, y, z];
  };
}

/** Обхват модели по сечению, см. */
export function measureSlice(rig: Rig, key: SliceKey, w: Float32Array): number {
  const s = rig.lm.slices.find((x) => x.key === key);
  if (!s) return 0;
  const plane = slicePlane(rig.lm, s, w);
  const lim = s.lateral ? s.lateral * Math.abs(pointAt(rig.lm, 'l-shoulder', w)[0]) : Infinity;
  const keep = s.lateral ? (p: Vec3) => Math.abs(p[0]) <= lim : undefined;
  return tapeCircumference(rig.sliceTris.get(key)!, vertexGetter(rig, w), plane, s.radius, keep) * 100;
}

export function measureHeight(rig: Rig, w: Float32Array): number {
  const g = vertexGetter(rig, w);
  return (g(rig.lm.top)[1] - g(rig.lm.bottom)[1]) * 100;
}

export function measureAll(rig: Rig, w: Float32Array): Record<SliceKey | 'height', number> {
  const out = { height: measureHeight(rig, w) } as Record<SliceKey | 'height', number>;
  for (const s of rig.lm.slices) out[s.key] = measureSlice(rig, s.key, w);
  return out;
}

/** Бисекция по монотонно возрастающей функции f(p) на [lo, hi]. */
export function bisect(f: (p: number) => number, target: number, lo = -PARAM_LIMIT, hi = PARAM_LIMIT, iters = 22): number {
  let flo = f(lo);
  let fhi = f(hi);
  if (flo > fhi) {
    // на всякий случай: если функция убывает — меняем местами
    [lo, hi] = [hi, lo];
    [flo, fhi] = [fhi, flo];
  }
  if (target <= flo) return lo;
  if (target >= fhi) return hi;
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export type Targets = Partial<Record<SliceKey | 'height', number>>;

export interface Calibration {
  params: Params;
  weights: Float32Array;
  achieved: Record<SliceKey | 'height', number>;
  residuals: Partial<Record<SliceKey | 'height', number>>;
  /** замеры, не попавшие в допуск ±tol см */
  outOfTolerance: Array<SliceKey | 'height'>;
  /** параметры за пределами родного диапазона MakeHuman (экстраполяция) */
  extrapolated: MorphParam[];
  rounds: number;
}

/** Порядок подгонки: сначала торс, затем конечности; плечи после груди (зависят от неё). */
const ORDER: SliceKey[] = ['waist', 'hips', 'chest', 'shoulders', 'neck', 'biceps', 'forearm', 'wrist', 'thigh', 'knee', 'calf', 'ankle'];

export function calibrate(rig: Rig, targets: Targets, globals: Params = {}, opts: { rounds?: number; tol?: number } = {}): Calibration {
  const rounds = opts.rounds ?? 4;
  const tol = opts.tol ?? 2;
  const names = rig.lm.morphNames;
  const params: Params = { ...globals };
  const W = () => paramsToWeights(params, names);

  if (targets.height) {
    params.height = bisect((p) => measureHeight(rig, paramsToWeights({ ...params, height: p }, names)), targets.height, -1, 1);
  }
  const keys = ORDER.filter((k) => targets[k] !== undefined && rig.sliceTris.has(k));
  let done = 0;
  for (let r = 0; r < rounds; r++) {
    let maxErr = 0;
    for (const k of keys) {
      const p = k as MorphParam;
      params[p] = bisect((v) => measureSlice(rig, k, paramsToWeights({ ...params, [p]: v }, names)), targets[k]!);
    }
    done = r + 1;
    const w = W();
    for (const k of keys) maxErr = Math.max(maxErr, Math.abs(measureSlice(rig, k, w) - targets[k]!));
    if (maxErr < 0.3) break;
  }
  const weights = W();
  const achieved = measureAll(rig, weights);
  const residuals: Calibration['residuals'] = {};
  const outOfTolerance: Calibration['outOfTolerance'] = [];
  for (const k of [...keys, ...(targets.height ? (['height'] as const) : [])]) {
    const res = achieved[k] - targets[k]!;
    residuals[k] = res;
    if (Math.abs(res) > tol) outOfTolerance.push(k);
  }
  const extrapolated = (Object.keys(params) as MorphParam[]).filter((p) => Math.abs(params[p] ?? 0) > NATIVE_LIMIT + 1e-6);
  return { params, weights, achieved, residuals, outOfTolerance, extrapolated, rounds: done };
}

/** Глобальные морфы из состава тела (эвристика): мышечность из нормализованного FFMI, жир из %. */
export function globalsFromComposition(normFfmi?: number | null, bodyFat?: number | null): Params {
  const clamp = (x: number) => Math.max(-1, Math.min(1, x));
  const g: Params = {};
  if (normFfmi != null) g.muscle = clamp((normFfmi - 20) / 4);
  if (bodyFat != null) g.fat = clamp((bodyFat - 16) / 10);
  return g;
}
