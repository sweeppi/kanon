import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { convexHullPerimeter, tapeCircumference } from '../src/lib/model/slice';
import { buildRig, calibrate, measureAll, paramsToWeights, bisect, type Rig } from '../src/lib/model/calibrate';
import type { Landmarks } from '../src/lib/model/schema';
import landmarks from '../src/lib/model/landmarks.json';

describe('Геометрия сечения', () => {
  it('периметр выпуклой оболочки квадрата и круга', () => {
    expect(convexHullPerimeter([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]])).toBeCloseTo(4, 9);
    const circle: Array<[number, number]> = Array.from({ length: 720 }, (_, i) => [Math.cos((i / 720) * 2 * Math.PI), Math.sin((i / 720) * 2 * Math.PI)]);
    expect(convexHullPerimeter(circle)).toBeCloseTo(2 * Math.PI, 3);
  });
  it('лента не заходит во впадины (звезда → периметр оболочки)', () => {
    const star: Array<[number, number]> = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.3 : 1;
      star.push([r * Math.cos((i * Math.PI) / 5), r * Math.sin((i * Math.PI) / 5)]);
    }
    const pentagon = 5 * 2 * Math.sin(Math.PI / 5);
    expect(convexHullPerimeter(star)).toBeCloseTo(pentagon, 6);
  });
  it('сечение цилиндра горизонтальной плоскостью = 2πr', () => {
    const { pos, tris } = cylinder(0.15, 1, 64, 10);
    const c = tapeCircumference(tris, (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], { origin: [0, 0.55, 0], normal: [0, 1, 0] });
    expect(c).toBeCloseTo(2 * Math.PI * 0.15, 2);
  });
});

// Цилиндр с морфом «радиус +50 %» — синтетическая проверка калибровки
function cylinder(r: number, h: number, seg: number, rings: number) {
  const pos: number[] = [];
  const tris: number[] = [];
  for (let j = 0; j <= rings; j++)
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(r * Math.cos(a), (j / rings) * h, r * Math.sin(a));
    }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * seg + i;
      const b = j * seg + ((i + 1) % seg);
      tris.push(a, b, a + seg, b, b + seg, a + seg);
    }
  return { pos: Float32Array.from(pos), tris: Uint32Array.from(tris) };
}

describe('Калибровка на синтетическом цилиндре', () => {
  it('подбирает вес морфа под целевой обхват', () => {
    const { pos, tris } = cylinder(0.15, 1, 64, 10);
    const delta = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      delta[i] = pos[i] * 0.5;
      delta[i + 2] = pos[i + 2] * 0.5;
    }
    const lm: Landmarks = {
      version: 1,
      morphNames: ['waist_incr', 'waist_decr'],
      segNames: ['torso'],
      top: pos.length / 3 - 1,
      bottom: 0,
      points: { a: { base: [0, 0, 0], d: {} }, b: { base: [0, 1, 0], d: {} }, 'l-shoulder': { base: [0.2, 1, 0], d: {} } },
      slices: [{ key: 'waist', a: 'a', b: 'b', t: 0.5, normal: 'up', radius: 1, segs: [0] }],
    };
    const decr = delta.map((v) => -v * 0.5);
    const rig = buildRig(pos, [delta, decr], tris, new Float32Array(pos.length / 3), lm);
    const target = 2 * Math.PI * 0.18 * 100; // радиус 18 см → нужен вес 0.4
    const cal = calibrate(rig, { waist: target });
    expect(cal.params.waist).toBeCloseTo(0.4, 2);
    expect(Math.abs(cal.residuals.waist!)).toBeLessThan(0.1);
    const small = calibrate(rig, { waist: 2 * Math.PI * 0.12 * 100 }); // радиус 12 см → decr 0.8
    expect(small.params.waist).toBeCloseTo(-0.8, 2);
  });
  it('бисекция упирается в пределы и сообщает об этом', () => {
    expect(bisect((p) => p, 10, -1, 1)).toBe(1);
    expect(bisect((p) => p, -10, -1, 1)).toBe(-1);
  });
});

const GLB = resolve(__dirname, '../model-src/body-uncompressed.glb');
describe.skipIf(!existsSync(GLB))('Калибровка реальной модели MakeHuman (GLB без сжатия)', () => {
  let rig: Rig;
  beforeAll(async () => {
    const doc = await new NodeIO().read(GLB);
    const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    const base = prim.getAttribute('POSITION')!.getArray() as Float32Array;
    const deltas = prim.listTargets().map((t) => {
      const acc = t.getAttribute('POSITION')!;
      const out = new Float32Array(acc.getCount() * 3);
      const v = [0, 0, 0];
      for (let i = 0; i < acc.getCount(); i++) out.set(acc.getElement(i, v), i * 3);
      return out;
    });
    const segAcc = prim.getAttribute('_SEG')!;
    const seg = new Float32Array(segAcc.getCount());
    for (let i = 0; i < seg.length; i++) seg[i] = segAcc.getScalar(i);
    rig = buildRig(base, deltas, prim.getIndices()!.getArray()!, seg, landmarks as unknown as Landmarks);
  });

  it('база: правдоподобные обхваты мужчины 173 см', () => {
    const m = measureAll(rig, paramsToWeights({}, rig.lm.morphNames));
    expect(m.height).toBeCloseTo(173, 0);
    expect(m.chest).toBeGreaterThan(85);
    expect(m.chest).toBeLessThan(115);
    expect(m.waist).toBeGreaterThan(65);
    expect(m.waist).toBeLessThan(95);
  });

  it('фиктивный атлет 180 см: все обхваты в пределах 2 см', () => {
    // вымышленный набор замеров (не данные пользователя)
    const targets = { height: 180, neck: 39, shoulders: 120, chest: 102, waist: 82, hips: 97, biceps: 34, forearm: 29, wrist: 17, thigh: 57, knee: 38, calf: 38, ankle: 22.5 };
    const t0 = performance.now();
    const cal = calibrate(rig, targets, { muscle: 0.3, fat: -0.1 });
    const ms = performance.now() - t0;
    for (const [k, v] of Object.entries(cal.residuals)) expect(Math.abs(v!), `${k}: ${v}`).toBeLessThanOrEqual(2);
    expect(cal.outOfTolerance).toEqual([]);
    expect(ms).toBeLessThan(5000);
  });

  it('фиктивная женщина 165 см (морф пола): обхваты в пределах 2 см', () => {
    const targets = { height: 165, neck: 32, shoulders: 105, chest: 90, waist: 68, hips: 96, biceps: 27, forearm: 23, wrist: 15, thigh: 56, knee: 35, calf: 35, ankle: 21 };
    const cal = calibrate(rig, targets, { sex: 1, muscle: -0.2, fat: 0 });
    for (const [k, v] of Object.entries(cal.residuals)) expect(Math.abs(v!), `${k}: ${v}`).toBeLessThanOrEqual(2);
    expect(cal.params.sex).toBe(1);
  });

  it('рельеф на максимуме (натуральный потолок) не мешает подгонке обхватов', () => {
    const targets = { height: 180, neck: 42, shoulders: 132, chest: 112, waist: 78, hips: 97, biceps: 39, forearm: 32, wrist: 17.5, thigh: 62, knee: 39, calf: 41, ankle: 23 };
    const cal = calibrate(rig, targets, { muscle: 1, definition: 1.0, fat: -0.7 });
    // морф предплечья MakeHuman слабый: при пределе растяжения 1,3 большое предплечье честно помечается «вне допуска»
    for (const [k, v] of Object.entries(cal.residuals)) if (k !== 'forearm') expect(Math.abs(v!), `${k}: ${v}`).toBeLessThanOrEqual(2);
    expect(Math.abs(cal.residuals.forearm!) <= 2 || cal.outOfTolerance.includes('forearm')).toBe(true);
  });

  it('нереалистичный замер честно помечается как вне допуска', () => {
    const cal = calibrate(rig, { height: 180, biceps: 70 });
    expect(cal.outOfTolerance).toContain('biceps');
  });
});

describe('Кольцо замера на модели', () => {
  it('кольцо — та же лента, что и обхват: периметр совпадает с измерением', async () => {
    const { sliceRing, measureSlice } = await import('../src/lib/model/calibrate');
    const { pos, tris } = cylinder(0.15, 1, 64, 10);
    const lm: Landmarks = {
      version: 1,
      morphNames: [],
      segNames: ['torso'],
      top: pos.length / 3 - 1,
      bottom: 0,
      points: { a: { base: [0, 0, 0], d: {} }, b: { base: [0, 1, 0], d: {} }, 'l-shoulder': { base: [0.2, 1, 0], d: {} } },
      slices: [{ key: 'waist', a: 'a', b: 'b', t: 0.55, normal: 'up', radius: 1, segs: [0] }],
    };
    const rig = buildRig(pos, [], tris, new Float32Array(pos.length / 3), lm);
    const ring = sliceRing(rig, 'waist', new Float32Array(0));
    expect(ring.length).toBeGreaterThan(30);
    for (const p of ring) {
      expect(p[1]).toBeCloseTo(0.55, 6); // лежит в плоскости сечения
      expect(Math.hypot(p[0], p[2])).toBeCloseTo(0.15, 2);
    }
    let per = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      per += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    expect(per * 100).toBeCloseTo(measureSlice(rig, 'waist', new Float32Array(0)), 6);
    expect(sliceRing(rig, 'chest', new Float32Array(0))).toEqual([]);
  });
});
