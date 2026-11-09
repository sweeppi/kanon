// Тот же путь, что в браузере: сжатый GLB → three.js GLTFLoader + meshopt → rigFromMesh → калибровка.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Mesh, Object3D } from 'three';
import { rigFromMesh } from '../src/lib/model/browserRig';
import { targetsFromValues } from '../src/lib/model/targets';
import { calibrate, measureAll, paramsToWeights, type Rig } from '../src/lib/model/calibrate';
import type { Landmarks } from '../src/lib/model/schema';
import landmarks from '../src/lib/model/landmarks.json';

describe('Сжатый GLB в three.js (как в приложении)', () => {
  let rig: Rig;
  beforeAll(async () => {
    const buf = readFileSync(resolve(__dirname, '../public/models/body.glb'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    await MeshoptDecoder.ready;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(ab, '');
    let mesh: Mesh | null = null;
    gltf.scene.traverse((o: Object3D) => {
      if (!mesh && (o as Mesh).isMesh) mesh = o as Mesh;
    });
    rig = rigFromMesh(mesh!, landmarks as unknown as Landmarks);
  });

  it('база совпадает с несжатой моделью (рост 173 см)', () => {
    const m = measureAll(rig, paramsToWeights({}, rig.lm.morphNames));
    expect(m.height).toBeCloseTo(173, 0);
    expect(m.chest).toBeGreaterThan(90);
    expect(m.chest).toBeLessThan(110);
  });

  it('вымышленные замеры: все обхваты в пределах 2 см', () => {
    const t = targetsFromValues({ height: 180, neck: 39, shoulders: 119, chest: 102, waist: 83.5, hips: 99, thigh: 58, knee: 39, calf: 38, ankle: 23, bicepsRelaxed: 35, forearm: 30, wrist: 17.5 }, 180);
    const cal = calibrate(rig, t, { muscle: 0.3, fat: -0.1 });
    for (const [k, v] of Object.entries(cal.residuals)) expect(Math.abs(v!), `${k}: ${v}`).toBeLessThanOrEqual(2);
  });
});
