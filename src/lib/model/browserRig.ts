// Построение рига (массивы для калибровки) из меша, загруженного GLTFLoader.
import { Matrix3, Vector3, type Mesh, type BufferAttribute, type InterleavedBufferAttribute } from 'three';
import { buildRig, type Rig } from './calibrate';
import type { Landmarks } from './schema';

type Attr = BufferAttribute | InterleavedBufferAttribute;

/** Позиции в мировых метрах: учитываем матрицу узла (KHR_mesh_quantization кладёт масштаб в узел). */
export function rigFromMesh(mesh: Mesh, lm: Landmarks): Rig {
  mesh.updateMatrix();
  const m4 = mesh.matrix;
  const m3 = new Matrix3().setFromMatrix4(m4);
  const g = mesh.geometry;
  const pos = g.getAttribute('position') as Attr;
  const n = pos.count;
  const v = new Vector3();
  const base = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m4);
    base.set([v.x, v.y, v.z], i * 3);
  }
  const morphs = (g.morphAttributes.position ?? []) as Attr[];
  const dict = mesh.morphTargetDictionary ?? {};
  const byIndex: Attr[] = [];
  for (const [name, idx] of Object.entries(dict)) {
    const k = lm.morphNames.indexOf(name);
    if (k >= 0) byIndex[k] = morphs[idx];
  }
  const deltas = lm.morphNames.map((_, k) => {
    const a = byIndex[k];
    const out = new Float32Array(n * 3);
    if (!a) return out;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(a, i).applyMatrix3(m3);
      out.set([v.x, v.y, v.z], i * 3);
    }
    return out;
  });
  const segAttr = g.getAttribute('_seg') as Attr;
  const seg = new Float32Array(n);
  for (let i = 0; i < n; i++) seg[i] = segAttr.getX(i);
  const index = g.getIndex()!.array;
  return buildRig(base, deltas, index, seg, lm);
}

