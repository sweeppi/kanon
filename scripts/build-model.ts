// Сборка 3D-модели тела из ассетов MakeHuman (CC0) без Blender.
// Запуск:  npm run model   (Node 22.6+ запускает .ts напрямую)
//
// Что делает:
// 1. Читает base.obj и морфы .target, собирает молодого мужчину (среднее по трём расам MakeHuman).
// 2. Оставляет только группу body (без глаз, зубов, вспомогательных «одежд»).
// 3. Превращает пары incr/decr MakeHuman в 30 morph targets glTF (рост, мышечность, жир, 12 обхватов).
// 4. Размечает вершины по мышечным зонам (для тепловой карты).
// 5. Находит анатомические сечения для замеров (шея, талия на уровне пупка и т. д.).
// 6. Пишет public/models/body.glb (сжатие meshopt через gltf-transform) и src/lib/model/landmarks.json.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt, sparse, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { parseObj, parseTarget, applyTarget, diffTargets, sumTargets, type Target } from './mh.ts';
import { tapeCircumference, lerp, sub, norm, dot, len, type Vec3 } from '../src/lib/model/slice.ts';
import { ZONES, MORPH_PARAMS, type SliceDef } from '../src/lib/model/schema.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MH = resolve(ROOT, 'model-src/makehuman');
const T = (name: string) => parseTarget(resolve(MH, 'targets', name + '.target'));

// ---------- 1. база ----------
const obj = parseObj(resolve(MH, 'base.obj'));
const P = obj.positions;
for (const race of ['caucasian', 'african', 'asian']) applyTarget(P, T(`${race}-male-young`), 1 / 3);

// ---------- 2. только тело ----------
const bodyFaces = obj.groups.get('body')!;
const oldToNew = new Map<number, number>();
const newToOld: number[] = [];
for (const f of bodyFaces)
  for (const i of f)
    if (!oldToNew.has(i)) {
      oldToNew.set(i, newToOld.length);
      newToOld.push(i);
    }
const NV = newToOld.length;
const tris: number[] = [];
for (const f of bodyFaces) {
  const q = f.map((i) => oldToNew.get(i)!);
  tris.push(q[0], q[1], q[2]);
  if (q.length === 4) tris.push(q[0], q[2], q[3]);
}

let groundY = Infinity;
for (const o of newToOld) groundY = Math.min(groundY, P[o * 3 + 1]);
const S = 0.1; // дециметры MakeHuman -> метры
const toWorld = (x: number, y: number, z: number): Vec3 => [x * S, (y - groundY) * S, z * S];

const base = new Float32Array(NV * 3);
newToOld.forEach((o, n) => base.set(toWorld(P[o * 3], P[o * 3 + 1], P[o * 3 + 2]), n * 3));

// Суставы MakeHuman (вспомогательные группы joint-*) — центр масс их вершин
const jointVerts = new Map<string, number[]>();
for (const [g, faces] of obj.groups)
  if (g.startsWith('joint-')) {
    const s = new Set<number>();
    for (const f of faces) for (const i of f) s.add(i);
    jointVerts.set(g.slice(6), [...s]);
  }
const jointPos = (name: string, pos: Float64Array): Vec3 => {
  const vs = jointVerts.get(name)!;
  const c: Vec3 = [0, 0, 0];
  for (const i of vs) {
    c[0] += pos[i * 3];
    c[1] += pos[i * 3 + 1];
    c[2] += pos[i * 3 + 2];
  }
  return toWorld(c[0] / vs.length, c[1] / vs.length, c[2] / vs.length);
};

// ---------- 3. морфы ----------
const avg = T('universal-male-young-averagemuscle-averageweight'); // пустой, оставлен для ясности
const morphSources: Record<string, Target> = {
  height_incr: T('male-young-averagemuscle-averageweight-maxheight'),
  height_decr: T('male-young-averagemuscle-averageweight-minheight'),
  muscle_incr: diffTargets(T('universal-male-young-maxmuscle-averageweight'), avg),
  muscle_decr: diffTargets(T('universal-male-young-minmuscle-averageweight'), avg),
  fat_incr: diffTargets(T('universal-male-young-averagemuscle-maxweight'), avg),
  fat_decr: diffTargets(T('universal-male-young-averagemuscle-minweight'), avg),
};
const measureMap: Record<string, string> = {
  neck: 'neck-circ',
  shoulders: 'shoulder-dist',
  chest: 'bust-circ',
  waist: 'waist-circ',
  hips: 'hips-circ',
  biceps: 'upperarm-circ',
  thigh: 'thigh-circ',
  calf: 'calf-circ',
  wrist: 'wrist-circ',
  ankle: 'ankle-circ',
  knee: 'knee-circ',
};
// Пол: (среднее женских − среднее мужских) молодых таргетов трёх рас MakeHuman
{
  const scaleT = (t: Target, k: number): Target => new Map([...t].map(([i, d]) => [i, [d[0] * k, d[1] * k, d[2] * k] as [number, number, number]]));
  const races = ['caucasian', 'african', 'asian'];
  const fem = sumTargets(...races.map((r) => scaleT(T(`${r}-female-young`), 1 / 3)));
  const mal = sumTargets(...races.map((r) => scaleT(T(`${r}-male-young`), 1 / 3)));
  morphSources.sex_incr = diffTargets(fem, mal);
  morphSources.sex_decr = new Map(); // «обратный пол» не нужен — пустой морф, почти ничего не весит
}
// Мышечный рельеф: сумма «muscle»-таргетов частей тела MakeHuman (CC0). Обхваты потом подгоняются
// своими морфами, поэтому рельеф меняет форму (V-силуэт, дельты, грудные), а не «раздувает» замеры.
{
  const parts = [
    'torso-muscle-pectoral-incr', 'torso-muscle-dorsi-incr', 'torso-vshape-incr',
    'l-upperarm-shoulder-muscle-incr', 'r-upperarm-shoulder-muscle-incr',
    'l-upperarm-muscle-incr', 'r-upperarm-muscle-incr',
    'l-upperleg-muscle-incr', 'r-upperleg-muscle-incr',
    'l-lowerleg-muscle-incr', 'r-lowerleg-muscle-incr',
  ];
  // V-силуэт очень сильный — 40 %; руки и ноги — 50 % (их объём задают замеры), грудные, широчайшие, дельты — 100 %
  const scaleT = (t: Target, k: number): Target => new Map([...t].map(([i, d]) => [i, [d[0] * k, d[1] * k, d[2] * k] as [number, number, number]]));
  const weight = (n: string) => (n === 'torso-vshape-incr' ? 0.3 : /shoulder-muscle/.test(n) ? 0.7 : /upperarm-muscle/.test(n) ? 0.5 : 1);
  morphSources.definition_incr = sumTargets(...parts.map((n) => scaleT(T(n), weight(n))));
  morphSources.definition_decr = new Map();
}
for (const [k, file] of Object.entries(measureMap))
  for (const d of ['incr', 'decr']) morphSources[`${k}_${d}`] = T(`measure-${file}-${d}`);
for (const d of ['incr', 'decr'])
  morphSources[`forearm_${d}`] = sumTargets(T(`l-lowerarm-muscle-${d}`), T(`r-lowerarm-muscle-${d}`));

const morphNames = MORPH_PARAMS.flatMap((p) => [`${p}_incr`, `${p}_decr`]);
for (const m of morphNames) if (!morphSources[m]) throw new Error('нет морфа ' + m);

// Дельты в метрах для вершин тела
const deltas: Float32Array<ArrayBuffer>[] = morphNames.map((m) => {
  const arr = new Float32Array(NV * 3);
  for (const [o, d] of morphSources[m]) {
    const n = oldToNew.get(o);
    if (n === undefined) continue;
    arr[n * 3] = d[0] * S;
    arr[n * 3 + 1] = d[1] * S;
    arr[n * 3 + 2] = d[2] * S;
  }
  return arr;
});

// Дельты суставов (среднее смещение их вершин) — чтобы плоскости сечений двигались вместе с морфами
const JOINTS = [
  'head', 'neck', 'spine-1', 'spine-2', 'spine-3', 'spine-4', 'pelvis',
  'l-clavicle', 'l-shoulder', 'l-elbow', 'l-hand', 'l-upper-leg', 'l-knee', 'l-ankle', 'l-foot-2',
  'r-clavicle', 'r-shoulder', 'r-elbow', 'r-hand', 'r-upper-leg', 'r-knee', 'r-ankle', 'r-foot-2',
  'head-2', 'l-finger-3-4', 'r-finger-3-4',
];
const points: Record<string, { base: Vec3; d: Record<number, Vec3> }> = {};
for (const j of JOINTS) {
  const b = jointPos(j, P);
  const d: Record<number, Vec3> = {};
  morphNames.forEach((m, k) => {
    const moved = Float64Array.from(P);
    applyTarget(moved, morphSources[m], 1);
    const p2 = jointPos(j, moved);
    const dd = sub(p2, b);
    if (len(dd) > 1e-6) d[k] = dd.map((v) => +v.toFixed(5)) as Vec3;
  });
  points[j] = { base: b.map((v) => +v.toFixed(5)) as Vec3, d };
}
const J = (n: string) => points[n].base;

// ---------- 4. зоны ----------
type Seg = { name: string; a: Vec3; b: Vec3 };
const segs: Seg[] = [];
const addChain = (name: string, chain: string[]) => {
  for (let i = 0; i + 1 < chain.length; i++) segs.push({ name, a: J(chain[i]), b: J(chain[i + 1]) });
};
addChain('torso', ['pelvis', 'spine-4', 'spine-3', 'spine-2', 'spine-1', 'neck']);
addChain('neck', ['neck', 'head']);
addChain('head', ['head', 'head-2']);
for (const s of ['l', 'r']) {
  addChain(`clav-${s}`, ['neck', `${s}-clavicle`, `${s}-shoulder`]);
  addChain(`upper-${s}`, [`${s}-shoulder`, `${s}-elbow`]);
  addChain(`fore-${s}`, [`${s}-elbow`, `${s}-hand`]);
  addChain(`hand-${s}`, [`${s}-hand`, `${s}-finger-3-4`]);
  addChain(`thigh-${s}`, [`${s}-upper-leg`, `${s}-knee`]);
  addChain(`shin-${s}`, [`${s}-knee`, `${s}-ankle`]);
  addChain(`foot-${s}`, [`${s}-ankle`, `${s}-foot-2`]);
}
const segDist = (p: Vec3, s: Seg) => {
  const ab = sub(s.b, s.a);
  const t = Math.max(0, Math.min(1, dot(sub(p, s.a), ab) / dot(ab, ab)));
  return { d: len(sub(p, lerp(s.a, s.b, t))), t };
};
const yNipple = J('spine-1')[1] + 0.02;
const yNavelGuess = J('spine-3')[1] - 0.03;
const zone = new Float32Array(NV);
const vertSeg: string[] = new Array(NV);
for (let n = 0; n < NV; n++) {
  const p: Vec3 = [base[n * 3], base[n * 3 + 1], base[n * 3 + 2]];
  let best = '';
  let bestD = Infinity;
  let bestT = 0;
  for (const s of segs) {
    const r = segDist(p, s);
    if (r.d < bestD) {
      bestD = r.d;
      best = s.name;
      bestT = r.t;
    }
  }
  // верхнюю треть плеча выделяем в отдельный сегмент «дельта»
  if (best.startsWith('upper') && bestT < 0.3) best = best.replace('upper', 'delt');
  vertSeg[n] = best;
  let z: number = ZONES.neutral;
  if (best === 'neck') z = ZONES.neck;
  else if (best.startsWith('clav')) z = p[1] > J('l-clavicle')[1] - 0.05 ? ZONES.shoulders : ZONES.chest;
  else if (best.startsWith('delt')) z = ZONES.shoulders;
  else if (best.startsWith('upper')) z = ZONES.arms;
  else if (best.startsWith('fore')) z = ZONES.forearms;
  else if (best.startsWith('thigh')) z = ZONES.thighs;
  else if (best.startsWith('shin')) z = ZONES.calves;
  else if (best === 'torso') {
    const front = p[2] > J('spine-2')[2] + 0.02;
    if (p[1] < J('spine-4')[1] - 0.02) z = ZONES.hips;
    else if (p[1] > yNipple - 0.08) z = front ? ZONES.chest : ZONES.back;
    else if (!front && p[1] > yNavelGuess + 0.05) z = ZONES.back;
    else z = ZONES.waist;
  }
  zone[n] = z;
}

// ---------- 4б. поза: руки вдоль тела ----------
// MakeHuman хранит тело в A-позе (руки разведены). Опускаем руки по скелету MakeHuman (CC0, model-src/makehuman/rigs):
// каждая вершина поворачивается вокруг сустава плеча (голова кости upperarm01) во фронтальной плоскости на угол θ·w,
// где w — сумма весов вершины у костей руки (upperarm01 и всех её потомков), нарисованных художниками MakeHuman.
// Интерполяция угла (а не позиций, как в линейном скиннинге) не даёт руке «сплющиться» у подмышки.
// Дельты морфов поворачиваются тем же поворотом, поэтому морф бицепса по-прежнему «раздувает» руку, а не сдвигает её вбок.
// Поправка (I − R)·d_сустава учитывает, что морфы сдвигают сам плечевой сустав (иначе рука отрывалась бы от плеча).
const ARM_ABDUCTION_DEG = 10; // руки чуть отведены, чтобы кисти не врезались в бёдра
const PALM_TWIST_DEG = -20; // ладони к бёдрам: при −50° ладони смотрят вперёд, при 0…+60° — назад (большой палец к телу); между ними — к бедру
const getBasePre = (i: number): Vec3 => [base[i * 3], base[i * 3 + 1], base[i * 3 + 2]];
{
  const RIG = resolve(MH, 'rigs');
  const skel = JSON.parse(readFileSync(resolve(RIG, 'default.mhskel'), 'utf8')) as {
    bones: Record<string, { head: string; tail: string; parent: string | null }>;
    joints: Record<string, number[]>;
  };
  const mhw = JSON.parse(readFileSync(resolve(RIG, 'default_weights.mhw'), 'utf8')) as { weights: Record<string, Array<[number, number]>> };
  const jointMean = (name: string): Vec3 => {
    const vs = skel.joints[name];
    const c: Vec3 = [0, 0, 0];
    for (const i of vs) for (let k = 0; k < 3; k++) c[k] += P[i * 3 + k];
    return toWorld(c[0] / vs.length, c[1] / vs.length, c[2] / vs.length);
  };
  const subtree = (root: string): string[] => {
    const out = [root];
    for (let i = 0; i < out.length; i++) for (const [n, b] of Object.entries(skel.bones)) if (b.parent === out[i]) out.push(n);
    return out;
  };
  const rotate = (v: Vec3, ang: number): Vec3 => {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
  };

  for (const side of ['l', 'r'] as const) {
    const B = side === 'l' ? 'L' : 'R';
    const sign = side === 'l' ? 1 : -1;
    const headJoint = `upperarm01.${B}____head`;
    const pivot = jointMean(headJoint);
    const wristP = jointMean(`wrist.${B}____head`);
    const cur = Math.atan2(wristP[1] - pivot[1], (wristP[0] - pivot[0]) * sign);
    const target = -Math.PI / 2 + (ARM_ABDUCTION_DEG * Math.PI) / 180;
    const theta = (target - cur) * sign;
    console.log(`Поза: рука ${side} опускается на ${((Math.abs(target - cur) * 180) / Math.PI).toFixed(1)}° (веса скелета MakeHuman)`);

    // вес вершины = сумма её весов у костей руки
    const w = new Float32Array(NV);
    for (const bone of subtree(`upperarm01.${B}`))
      for (const [o, wt] of mhw.weights[bone] ?? []) {
        const n = oldToNew.get(o);
        if (n !== undefined) w[n] += wt;
      }
    for (let n = 0; n < NV; n++) w[n] = Math.min(1, w[n]);

    // смещение сустава от каждого морфа (среднее по вершинам, задающим сустав)
    const pivotD: Vec3[] = morphNames.map((m) => {
      const vs = skel.joints[headJoint];
      const c: Vec3 = [0, 0, 0];
      for (const i of vs) {
        const d = morphSources[m].get(i);
        if (d) for (let k = 0; k < 3; k++) c[k] += (d[k] * S) / vs.length;
      }
      return c;
    });

    for (let n = 0; n < NV; n++) {
      if (w[n] < 1e-4) continue;
      const ang = theta * w[n];
      const r = rotate(sub(getBasePre(n), pivot), ang);
      base.set([pivot[0] + r[0], pivot[1] + r[1], pivot[2] + r[2]], n * 3);
      deltas.forEach((arr, k) => {
        const rd = rotate([arr[n * 3], arr[n * 3 + 1], arr[n * 3 + 2]], ang);
        const dc = pivotD[k];
        const rdc = rotate(dc, ang);
        arr.set([rd[0] + (dc[0] - rdc[0]) * w[n], rd[1] + (dc[1] - rdc[1]) * w[n], rd[2] + (dc[2] - rdc[2]) * w[n]], n * 3);
      });
    }

    // Ладони к бёдрам: поворот предплечья и кисти вокруг оси предплечья (кость lowerarm02 и потомки — у MakeHuman
    // это «скручивающая» кость, её веса плавно растут от локтя к запястью, поэтому предплечье скручивается равномерно).
    {
      const posedJoint = (name: string): Vec3 => {
        const r = rotate(sub(jointMean(name), pivot), theta);
        return [pivot[0] + r[0], pivot[1] + r[1], pivot[2] + r[2]];
      };
      const elbow = posedJoint(`lowerarm01.${B}____head`);
      const wristJ = posedJoint(`wrist.${B}____head`);
      const axis = norm(sub(wristJ, elbow));
      const phi = (PALM_TWIST_DEG * Math.PI) / 180 * sign;
      const rotAxis = (v: Vec3, ang: number): Vec3 => {
        // формула Родрига
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const k = axis;
        const kv = dot(k, v);
        const kx: Vec3 = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
        return [v[0] * c + kx[0] * s + k[0] * kv * (1 - c), v[1] * c + kx[1] * s + k[1] * kv * (1 - c), v[2] * c + kx[2] * s + k[2] * kv * (1 - c)];
      };
      const tw = new Float32Array(NV);
      for (const bone of subtree(`lowerarm02.${B}`))
        for (const [o, wt] of mhw.weights[bone] ?? []) {
          const n = oldToNew.get(o);
          if (n !== undefined) tw[n] += wt;
        }
      // кисть и пальцы целиком — к ним добавляем полный вес (у lowerarm02 вес на кисти частичный)
      for (const bone of subtree(`wrist.${B}`))
        for (const [o] of mhw.weights[bone] ?? []) {
          const n = oldToNew.get(o);
          if (n !== undefined) tw[n] = 1;
        }
      for (let n = 0; n < NV; n++) {
        const t = Math.min(1, tw[n]);
        if (t < 1e-4) continue;
        const r = rotAxis(sub(getBasePre(n), elbow), phi * t);
        base.set([elbow[0] + r[0], elbow[1] + r[1], elbow[2] + r[2]], n * 3);
        for (const arr of deltas) arr.set(rotAxis([arr[n * 3], arr[n * 3 + 1], arr[n * 3 + 2]], phi * t), n * 3);
      }
    }

    // Разметка сегментов следует за позой: вершины «руки», оставшиеся на торсе, больше не рука —
    // иначе сечение бицепса захватит кусок бока. И наоборот, вершины торса, ушедшие с рукой, — рука.
    const armSegs = new Set([`delt-${side}`, `upper-${side}`, `fore-${side}`, `hand-${side}`]);
    for (let n = 0; n < NV; n++) {
      if (armSegs.has(vertSeg[n]) && w[n] < 0.5) vertSeg[n] = getBasePre(n)[1] > pivot[1] ? `clav-${side}` : 'torso';
      else if (!armSegs.has(vertSeg[n]) && w[n] >= 0.5 && (vertSeg[n] === 'torso' || vertSeg[n].startsWith('clav'))) vertSeg[n] = `delt-${side}`;
    }

    // Суставы руки (точки сечений) поворачиваются целиком
    for (const j of [`${side}-elbow`, `${side}-hand`, `${side}-finger-3-4`]) {
      const pt = points[j];
      const r = rotate(sub(pt.base, pivot), theta);
      pt.base = [pivot[0] + r[0], pivot[1] + r[1], pivot[2] + r[2]].map((v) => +v.toFixed(5)) as Vec3;
      const keys = new Set([...Object.keys(pt.d).map(Number), ...pivotD.map((d, k) => (len(d) > 1e-7 ? k : -1)).filter((k) => k >= 0)]);
      for (const k of keys) {
        const rd = rotate(pt.d[k] ?? [0, 0, 0], theta);
        const rdc = rotate(pivotD[k], theta);
        const dd: Vec3 = [rd[0] + pivotD[k][0] - rdc[0], rd[1] + pivotD[k][1] - rdc[1], rd[2] + pivotD[k][2] - rdc[2]];
        if (len(dd) > 1e-6) pt.d[k] = dd.map((v) => +v.toFixed(5)) as Vec3;
        else delete pt.d[k];
      }
    }
  }
}

// ---------- 5. сечения ----------
const getBase = (i: number): Vec3 => [base[i * 3], base[i * 3 + 1], base[i * 3 + 2]];
const segNames = [...new Set(vertSeg)].sort();
const segId = new Float32Array(NV);
for (let n = 0; n < NV; n++) segId[n] = segNames.indexOf(vertSeg[n]);
const trisOfSegs = (names: string[]) => {
  const ok = (n: number) => names.includes(vertSeg[n]);
  const out: number[] = [];
  for (let t = 0; t < tris.length; t += 3)
    if (ok(tris[t]) && ok(tris[t + 1]) && ok(tris[t + 2])) out.push(tris[t], tris[t + 1], tris[t + 2]);
  return out;
};
const shoulderX = Math.abs(J('l-shoulder')[0]);
// Руки опущены и висят рядом с торсом, поэтому в сечения груди, талии и таза они не входят
const TORSO = ['torso', 'clav-l', 'clav-r', 'thigh-l', 'thigh-r', 'neck'];

// Сечение задаётся отрезком A→B между суставами, долей t и типом нормали:
// 'axis' — перпендикулярно отрезку (конечности), 'up' — горизонтально (торс: лента параллельно полу).
// mode: 'max'/'min' — ищем экстремум обхвата в диапазоне t, число — фиксированная доля.
function measureDef(
  def: Omit<SliceDef, 't' | 'segs'> & { segNames: string[] },
  range: [number, number],
  mode: 'max' | 'min' | number,
): SliceDef {
  const tris_ = trisOfSegs(def.segNames);
  const A = J(def.a);
  const B = J(def.b);
  const evalAt = (t: number) => {
    const origin = lerp(A, B, t);
    const normal: Vec3 = def.normal === 'up' ? [0, 1, 0] : norm(sub(B, A));
    const lim = def.lateral ? def.lateral * shoulderX : Infinity;
    return tapeCircumference(tris_, getBase, { origin, normal }, def.radius, (p) => Math.abs(p[0]) <= lim);
  };
  let bestT = typeof mode === 'number' ? mode : range[0];
  if (typeof mode !== 'number') {
    let bestV = mode === 'max' ? -Infinity : Infinity;
    for (let t = range[0]; t <= range[1] + 1e-9; t += 0.01) {
      const v = evalAt(t);
      if (v > 0 && (mode === 'max' ? v > bestV : v < bestV)) {
        bestV = v;
        bestT = t;
      }
    }
  }
  console.log(`  ${def.key.padEnd(10)} t=${bestT.toFixed(2)}  обхват базы ${(evalAt(bestT) * 100).toFixed(1)} см`);
  const { segNames: names, ...rest } = def;
  return { ...rest, t: +bestT.toFixed(3), segs: names.map((n) => segNames.indexOf(n)) };
}

const tY = (y: number) => (y - J('pelvis')[1]) / (J('neck')[1] - J('pelvis')[1]);

// Пупок: самая «утопленная» точка передней средней линии между тазом и spine-2
let navelY = yNavelGuess;
{
  const mid: Array<[number, number]> = [];
  for (let n = 0; n < NV; n++) {
    const [x, y, z] = getBase(n);
    if (Math.abs(x) < 0.004 && y > J('pelvis')[1] + 0.05 && y < J('spine-2')[1] && z > J('spine-3')[2]) mid.push([y, z]);
  }
  mid.sort((a, b) => a[0] - b[0]);
  // локальный минимум z относительно соседей (ямка пупка)
  let bestDip = 0;
  for (let i = 2; i < mid.length - 2; i++) {
    const dip = (mid[i - 2][1] + mid[i + 2][1]) / 2 - mid[i][1];
    if (dip > bestDip) {
      bestDip = dip;
      navelY = mid[i][0];
    }
  }
  console.log(`  пупок на высоте ${(navelY * 100).toFixed(1)} см (глубина ямки ${(bestDip * 1000).toFixed(1)} мм)`);
}
// Ягодицы: самая задняя точка между тазобедренным суставом и 20 см ниже
let buttY = J('l-upper-leg')[1] - 0.08;
{
  let minZ = Infinity;
  for (let n = 0; n < NV; n++) {
    const [x, y, z] = getBase(n);
    if (Math.abs(x) < shoulderX * 0.8 && y < J('pelvis')[1] && y > J('pelvis')[1] - 0.2 && z < minZ) {
      minZ = z;
      buttY = y;
    }
  }
}

console.log('Сечения на базовом меше:');
const slices: SliceDef[] = [
  measureDef({ key: 'neck', a: 'neck', b: 'head', normal: 'axis', radius: 0.1, segNames: ['neck', 'torso', 'head', 'clav-l', 'clav-r'] }, [0.1, 0.6], 'min'),
  measureDef(
    { key: 'shoulders', a: 'pelvis', b: 'neck', normal: 'up', radius: 0.4, segNames: ['torso', 'clav-l', 'clav-r', 'delt-l', 'delt-r'] },
    [0, 1],
    tY(J('l-shoulder')[1] - 0.01),
  ),
  measureDef({ key: 'chest', a: 'pelvis', b: 'neck', normal: 'up', radius: 0.3, lateral: 0.95, segNames: TORSO }, [0, 1], 0.74), // уровень, найденный как максимум обхвата по соскам в A-позе (версия 1)
  measureDef({ key: 'waist', a: 'pelvis', b: 'neck', normal: 'up', radius: 0.3, lateral: 0.95, segNames: TORSO }, [0, 1], tY(navelY)),
  measureDef({ key: 'hips', a: 'pelvis', b: 'neck', normal: 'up', radius: 0.35, lateral: 1.2, segNames: TORSO }, [0, 1], tY(buttY)),
  measureDef({ key: 'biceps', a: 'l-shoulder', b: 'l-elbow', normal: 'axis', radius: 0.15, segNames: ['upper-l', 'delt-l'] }, [0, 1], 0.5),
  measureDef({ key: 'forearm', a: 'l-elbow', b: 'l-hand', normal: 'axis', radius: 0.13, segNames: ['fore-l', 'upper-l'] }, [0.12, 0.45], 'max'),
  measureDef({ key: 'wrist', a: 'l-elbow', b: 'l-hand', normal: 'axis', radius: 0.1, segNames: ['fore-l', 'hand-l'] }, [0.8, 1.0], 'min'),
  measureDef({ key: 'thigh', a: 'l-upper-leg', b: 'l-knee', normal: 'axis', radius: 0.2, segNames: ['thigh-l'] }, [0, 1], 0.2),
  measureDef({ key: 'knee', a: 'l-knee', b: 'l-ankle', normal: 'axis', radius: 0.14, segNames: ['thigh-l', 'shin-l'] }, [0, 0], 0.02),
  measureDef({ key: 'calf', a: 'l-knee', b: 'l-ankle', normal: 'axis', radius: 0.15, segNames: ['shin-l'] }, [0.15, 0.5], 'max'),
  measureDef({ key: 'ankle', a: 'l-knee', b: 'l-ankle', normal: 'axis', radius: 0.1, segNames: ['shin-l', 'foot-l'] }, [0.75, 0.93], 'min'),
];

// Верх/низ для роста
let top = 0;
let bottom = 0;
for (let n = 0; n < NV; n++) {
  if (base[n * 3 + 1] > base[top * 3 + 1]) top = n;
  if (base[n * 3 + 1] < base[bottom * 3 + 1]) bottom = n;
}
console.log(`Рост базы: ${((base[top * 3 + 1] - base[bottom * 3 + 1]) * 100).toFixed(1)} см, вершин ${NV}, треугольников ${tris.length / 3}`);

// ---------- нормали ----------
function computeNormals(pos: Float32Array): Float32Array<ArrayBuffer> {
  const nrm = new Float32Array(pos.length);
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
    const pa: Vec3 = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]];
    const pb: Vec3 = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]];
    const pc: Vec3 = [pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]];
    const e1 = sub(pb, pa);
    const e2 = sub(pc, pa);
    const fn: Vec3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) nrm[v * 3 + k] += fn[k];
  }
  for (let v = 0; v < nrm.length; v += 3) {
    const l = Math.hypot(nrm[v], nrm[v + 1], nrm[v + 2]) || 1;
    nrm[v] /= l;
    nrm[v + 1] /= l;
    nrm[v + 2] /= l;
  }
  return nrm;
}
const baseN = computeNormals(base);

// ---------- 6. GLB ----------
const doc = new Document();
const buf = doc.createBuffer();
const acc = (arr: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>, type: 'VEC3' | 'SCALAR') =>
  doc.createAccessor().setArray(arr).setType(type).setBuffer(buf);
const prim = doc
  .createPrimitive()
  .setAttribute('POSITION', acc(base, 'VEC3'))
  .setAttribute('NORMAL', acc(baseN, 'VEC3'))
  .setAttribute('_ZONE', acc(zone, 'SCALAR'))
  .setAttribute('_SEG', acc(segId, 'SCALAR'))
  .setIndices(acc(Uint32Array.from(tris), 'SCALAR'));
morphNames.forEach((m, k) => {
  const moved = new Float32Array(base);
  for (let i = 0; i < moved.length; i++) moved[i] += deltas[k][i];
  const n2 = computeNormals(moved);
  const dn = new Float32Array(n2.length);
  for (let i = 0; i < dn.length; i++) dn[i] = n2[i] - baseN[i];
  const target = doc.createPrimitiveTarget(m).setAttribute('POSITION', acc(deltas[k], 'VEC3')).setAttribute('NORMAL', acc(dn, 'VEC3'));
  prim.addTarget(target);
});
const mesh = doc
  .createMesh('Body')
  .addPrimitive(prim)
  .setWeights(morphNames.map(() => 0))
  .setExtras({ targetNames: morphNames });
const node = doc.createNode('Body').setMesh(mesh);
doc.createScene('Scene').addChild(node);
doc.getRoot().getAsset().generator = 'kanon build-model.ts (MakeHuman CC0 assets)';

await MeshoptEncoder.ready;
await doc.transform(dedup(), prune(), sparse({ ratio: 1 / 3 }));
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
mkdirSync(resolve(ROOT, 'public/models'), { recursive: true });
const rawPath = resolve(ROOT, 'model-src/body-uncompressed.glb');
await io.write(rawPath, doc);
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const outPath = resolve(ROOT, 'public/models/body.glb');
await io.write(outPath, doc);

const landmarks = {
  version: 1,
  note: 'Сгенерировано scripts/build-model.ts из MakeHuman CC0. Единицы — метры, ось Y вверх, лицо смотрит в +Z.',
  morphNames,
  segNames,
  top,
  bottom,
  points,
  slices,
};
writeFileSync(resolve(ROOT, 'src/lib/model/landmarks.json'), JSON.stringify(landmarks));
const { statSync } = await import('node:fs');
console.log(`GLB: ${(statSync(outPath).size / 1024).toFixed(0)} КБ (без сжатия ${(statSync(rawPath).size / 1024).toFixed(0)} КБ)`);
