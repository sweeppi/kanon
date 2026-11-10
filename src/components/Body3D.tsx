// 3D-модель тела: MakeHuman (CC0) + морфы, откалиброванные под замеры. Грузится лениво (отдельный чанк three.js).
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { BufferAttribute, Color, DoubleSide, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import landmarksJson from '../lib/model/landmarks.json';
import type { Landmarks, ZoneName } from '../lib/model/schema';
import { ZONES } from '../lib/model/schema';
import { calibrate, vertexGetter, type Calibration, type Params, type Targets, type Rig } from '../lib/model/calibrate';
import { rigFromMesh } from '../lib/model/browserRig';

const lm = landmarksJson as unknown as Landmarks;
const MODEL_URL = `${import.meta.env.BASE_URL}models/body.glb`;
// Начальный ракурс: камера чуть выше пояса, центр вращения на уровне ~0,95 м (середина фигуры)
const CAM_POS: [number, number, number] = [0, 1.05, 3.4];
const CAM_TARGET: [number, number, number] = [0, 0.95, 0];

export interface BodySpec {
  targets: Targets;
  globals: Params;
}
export interface Body3DProps {
  primary: BodySpec;
  ghost?: BodySpec | null;
  heat?: boolean;
  zoneStatus?: Partial<Record<ZoneName, number>>;
  onCalibrated?: (main: Calibration, ghost: Calibration | null) => void;
  height?: number;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const GOOD = new Color('#4fb38a');
const MID = new Color('#e3b04b');
const BAD = new Color('#e0705a');
const NEUTRAL = new Color('#b9b2a7');
function heatColor(s: number | undefined, out: Color) {
  if (s === undefined) return out.copy(NEUTRAL);
  return s < 0.5 ? out.copy(BAD).lerp(MID, s * 2) : out.copy(MID).lerp(GOOD, (s - 0.5) * 2);
}

function useCalibration(rig: Rig | null, spec: BodySpec | null | undefined): Calibration | null {
  const key = spec ? JSON.stringify(spec) : '';
  const [cal, setCal] = useState<Calibration | null>(null);
  useEffect(() => {
    if (!rig || !spec) {
      setCal(null);
      return;
    }
    // откладываем тяжёлый расчёт, чтобы интерфейс успел отрисоваться
    const id = setTimeout(() => setCal(calibrate(rig, spec.targets, spec.globals)), 30);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rig, key]);
  return cal;
}

function BodyModel({ primary, ghost, heat, zoneStatus, onCalibrated }: Body3DProps) {
  const gltf = useGLTF(MODEL_URL, false, true);
  const invalidate = useThree((s) => s.invalidate);
  const src = useMemo(() => {
    let m: Mesh | null = null;
    gltf.scene.traverse((o: Object3D) => {
      if (!m && (o as Mesh).isMesh) m = o as Mesh;
    });
    return m as unknown as Mesh;
  }, [gltf]);
  const rig = useMemo(() => rigFromMesh(src, lm), [src]);

  const mainMat = useMemo(() => new MeshStandardMaterial({ color: '#d8cfc2', roughness: 0.48, metalness: 0.02 }), []);
  const ghostMat = useMemo(
    () => new MeshStandardMaterial({ color: '#c9965b', transparent: true, opacity: 0.28, depthWrite: false, roughness: 0.4, side: DoubleSide }),
    [],
  );
  const main = useMemo(() => {
    const m = new Mesh(src.geometry, mainMat);
    m.matrix.copy(src.matrix);
    m.matrixAutoUpdate = false;
    m.morphTargetDictionary = { ...src.morphTargetDictionary };
    m.morphTargetInfluences = new Array(src.morphTargetInfluences?.length ?? 0).fill(0);
    return m;
  }, [src, mainMat]);
  const ghostMesh = useMemo(() => {
    const m = new Mesh(src.geometry, ghostMat);
    m.matrix.copy(src.matrix);
    m.matrixAutoUpdate = false;
    m.renderOrder = 2;
    m.morphTargetDictionary = { ...src.morphTargetDictionary };
    m.morphTargetInfluences = new Array(src.morphTargetInfluences?.length ?? 0).fill(0);
    return m;
  }, [src, ghostMat]);

  const calMain = useCalibration(rig, primary);
  const calGhost = useCalibration(rig, ghost);

  useEffect(() => {
    if (calMain) onCalibrated?.(calMain, calGhost);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calMain, calGhost]);

  const apply = (mesh: Mesh, cal: Calibration | null) => {
    if (!cal || !mesh.morphTargetInfluences) return 0;
    lm.morphNames.forEach((name, k) => {
      const idx = mesh.morphTargetDictionary?.[name];
      if (idx !== undefined) mesh.morphTargetInfluences![idx] = cal.weights[k];
    });
    // ставим ступни на пол: смещение по нижней вершине
    return -vertexGetter(rig, cal.weights)(rig.lm.bottom)[1];
  };
  const mainOffset = apply(main, calMain);
  const ghostOffset = apply(ghostMesh, calGhost);

  // Тепловая карта: цвета вершин по зонам
  useEffect(() => {
    const g = src.geometry;
    const zone = g.getAttribute('_zone');
    const n = zone.count;
    const col = new Float32Array(n * 3);
    const c = new Color();
    const byId: Record<number, ZoneName> = Object.fromEntries(Object.entries(ZONES).map(([k, v]) => [v, k as ZoneName]));
    for (let i = 0; i < n; i++) {
      const z = byId[Math.round(zone.getX(i))];
      heatColor(z && z !== 'neutral' ? zoneStatus?.[z] : undefined, c);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
    mainMat.vertexColors = !!heat;
    mainMat.color.set(heat ? '#ffffff' : '#cfc6b8');
    mainMat.needsUpdate = true;
    invalidate();
  }, [src, zoneStatus, heat, mainMat, invalidate]);

  useEffect(() => {
    invalidate();
  }, [calMain, calGhost, invalidate]);

  if (!calMain) return null;
  return (
    <>
      <group position={[0, mainOffset, 0]}>
        <primitive object={main} />
      </group>
      {ghost && calGhost && (
        <group position={[0, ghostOffset, 0]}>
          <primitive object={ghostMesh} />
        </group>
      )}
    </>
  );
}

class GLBoundary extends Component<{ children: ReactNode; onError: (e: Error) => void }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error) {
    this.props.onError(err);
  }
  render() {
    return this.state.err ? null : this.props.children;
  }
}

export function BodyPoster({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="body-poster" role="img" aria-label="Заглушка 3D-модели">
      <svg viewBox="0 0 60 140" width="70" aria-hidden="true">
        <circle cx="30" cy="12" r="9" fill="currentColor" opacity=".35" />
        <path d="M14 26 Q30 20 46 26 L50 70 L42 72 L40 50 L38 80 L40 136 L32 136 L30 90 L28 136 L20 136 L22 80 L20 50 L18 72 L10 70 Z" fill="currentColor" opacity=".35" />
      </svg>
      <p>{message}</p>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

export default function Body3D(props: Body3DProps) {
  const [err, setErr] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const controls = useRef<OrbitControlsImpl>(null);
  const [gl] = useState(webglAvailable);
  // R3F рисует сцену только после того, как измерит контейнер. Если первое измерение потерялось
  // (страница открылась в фоне, после перезагрузки сразу на этой вкладке), холст остаётся 300×150 и пустым.
  // Подталкиваем измерение: событие resize окна сразу после монтирования и при возврате на вкладку.
  useEffect(() => {
    const kick = () => window.dispatchEvent(new Event('resize'));
    const timers = [50, 300, 1000].map((ms) => setTimeout(kick, ms));
    const onVis = () => document.visibilityState === 'visible' && kick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      timers.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [attempt]);
  const rm = reducedMotion();
  if (!gl) return <BodyPoster message="WebGL недоступен в этом браузере — 3D-модель не показывается. Остальное приложение работает." />;
  if (err)
    return (
      <BodyPoster
        message={`Не удалось показать 3D-модель: ${err.message}`}
        onRetry={() => {
          setErr(null);
          setAttempt((a) => a + 1);
        }}
      />
    );
  return (
    <div className="body3d" style={{ height: props.height ?? 380 }}>
      <Canvas
        key={attempt}
        frameloop="demand"
        dpr={[1, Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)]}
        camera={{ position: CAM_POS, fov: 32, near: 0.1, far: 30 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        onCreated={({ gl: r }) => {
          r.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            setErr(new Error('контекст WebGL потерян'));
          });
        }}
      >
        {/* Свет «как в зале»: ключевой сверху-сбоку рисует тени рельефа, контровой обрисовывает силуэт */}
        <hemisphereLight args={['#f4efe6', '#2a2620', 0.35]} />
        <directionalLight position={[1.6, 3.2, 2.2]} intensity={2.4} />
        <directionalLight position={[-2.5, 1.2, 1.5]} intensity={0.45} color="#b8c4d6" />
        <directionalLight position={[0, 2.5, -3]} intensity={1.3} color="#c9965b" />
        <GLBoundary onError={setErr}>
          <Suspense fallback={null}>
            <BodyModel {...props} />
          </Suspense>
        </GLBoundary>
        <OrbitControls
          ref={controls}
          makeDefault
          target={CAM_TARGET}
          enablePan={false}
          minDistance={1.3}
          maxDistance={5}
          minPolarAngle={0.25}
          maxPolarAngle={Math.PI - 0.25}
          enableDamping={!rm}
        />
      </Canvas>
      <button className="btn btn-small body3d-reset" onClick={() => {
          // reset() вернул бы состояние на момент создания контролов — тогда центр ещё (0,0,0), и камера смотрит в пол.
          // Поэтому задаём начальный ракурс явно.
          const c = controls.current;
          if (!c) return;
          c.target.set(...CAM_TARGET);
          c.object.position.set(...CAM_POS);
          c.object.zoom = 1;
          c.object.updateProjectionMatrix();
          c.update(); // шлёт событие change → R3F перерисовывает кадр (frameloop="demand")
        }} aria-label="Сбросить ракурс">
        ⟲ Ракурс
      </button>
    </div>
  );
}
