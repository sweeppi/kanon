// 3D-модель тела: MakeHuman (CC0) + морфы, откалиброванные под замеры. Грузится лениво (отдельный чанк three.js).
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Html, Line, OrbitControls, useGLTF } from '@react-three/drei';
import { BufferAttribute, CatmullRomCurve3, Color, DoubleSide, Mesh, MeshStandardMaterial, PMREMGenerator, Vector3, type Object3D } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import landmarksJson from '../lib/model/landmarks.json';
import type { Landmarks, SliceKey, ZoneName } from '../lib/model/schema';
import { ZONES } from '../lib/model/schema';
import { calibrate, sliceRing, vertexGetter, type Calibration, type Params, type Targets, type Rig } from '../lib/model/calibrate';
import { rigFromMesh } from '../lib/model/browserRig';
import { Icon } from './icons';

const lm = landmarksJson as unknown as Landmarks;
const MODEL_URL = `${import.meta.env.BASE_URL}models/body.glb`;
// Начальный ракурс: руки опущены, фигура узкая — камера ближе и чуть выше пояса,
// центр вращения на середине фигуры. При fov 30° на 3,75 м в кадр входит ≈ 2 м высоты.
const CAM_POS: [number, number, number] = [0, 1.0, 3.75];
const CAM_TARGET: [number, number, number] = [0, 0.92, 0];
const CAM_FOV = 30;

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
  /** кольца замеров на модели: та же «лента», что считает обхват, и подпись со значением */
  rings?: RingSpec[];
}

export interface RingSpec {
  key: SliceKey;
  label: string;
  /** с какой стороны вынести подпись: 1 — справа на экране, -1 — слева */
  side: 1 | -1;
  onClick?: () => void;
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

function BodyModel({ primary, ghost, heat, zoneStatus, onCalibrated, rings }: Body3DProps) {
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

  const mainMat = useMemo(() => new MeshStandardMaterial({ color: '#cdc8c1', roughness: 0.6, metalness: 0 }), []);
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
    mainMat.color.set(heat ? '#ffffff' : '#cdc8c1');
    mainMat.needsUpdate = true;
    invalidate();
  }, [src, zoneStatus, heat, mainMat, invalidate]);

  useEffect(() => {
    invalidate();
  }, [calMain, calGhost, invalidate]);

  const ringData = useMemo(() => {
    if (!calMain || !rings?.length) return [];
    return rings.flatMap((r) => {
      const pts = sliceRing(rig, r.key, calMain.weights);
      if (pts.length < 3) return [];
      // кольцо чуть шире тела (на 3 мм), чтобы лежало на коже, а не уходило внутрь
      const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
      const out = pts.map((p) => {
        const d = new Vector3(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
        const l = d.length() || 1;
        return new Vector3(p[0], p[1], p[2]).addScaledVector(d, 0.003 / l);
      });
      const curve = new CatmullRomCurve3(out, true, 'centripetal');
      const loop = curve.getSpacedPoints(96);
      // точка подписи — край кольца со стороны подписи; сама подпись — в колонке сбоку от тела
      const edge = out.reduce((best, p) => (p.x * r.side > best.x * r.side ? p : best), out[0]);
      const tag = new Vector3(r.side * 0.36, edge.y, edge.z);
      return [{ ...r, loop, edge, tag }];
    });
  }, [calMain, rings, rig]);

  if (!calMain) return null;
  return (
    <>
      <group position={[0, mainOffset, 0]}>
        <primitive object={main} />
        {ringData.map((r) => (
          <group key={r.key}>
            <Line points={r.loop} color="#c9965b" lineWidth={2.2} transparent opacity={0.95} />
            <Line points={[r.edge, r.tag]} color="#c9965b" lineWidth={1} transparent opacity={0.6} />
            <Html position={r.tag} zIndexRange={[10, 0]} style={{ pointerEvents: 'auto' }}>
              <button
                type="button"
                className={`ringtag ${r.side < 0 ? 'ringtag-left' : 'ringtag-right'}`}
                onClick={r.onClick}
                aria-label={`${r.label}. Открыть замеры`}
              >
                {r.label}
              </button>
            </Html>
          </group>
        ))}
      </group>
      {ghost && calGhost && (
        <group position={[0, ghostOffset, 0]}>
          <primitive object={ghostMesh} />
        </group>
      )}
    </>
  );
}

/** Процедурное студийное окружение (RoomEnvironment): работает офлайн, ничего не скачивает. */
function Studio() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const pm = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pm.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.2;
    invalidate();
    return () => {
      scene.environment = null;
      env.dispose();
      pm.dispose();
      room.dispose();
    };
  }, [gl, scene, invalidate]);
  return null;
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
        camera={{ position: CAM_POS, fov: CAM_FOV, near: 0.1, far: 30 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        onCreated={({ gl: r }) => {
          r.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            setErr(new Error('контекст WebGL потерян'));
          });
        }}
      >
        {/* Студия: мягкое окружение даёт объём без резких бликов, ключевой свет сверху-сбоку рисует мышцы,
            контровой бронзовый отделяет силуэт от чёрного фона */}
        <Studio />
        <directionalLight position={[2.4, 2.6, 1.6]} intensity={2.4} />
        <directionalLight position={[-2.4, 1.2, 1.4]} intensity={0.3} color="#c8d2e0" />
        <directionalLight position={[0, 2.2, -3]} intensity={0.9} color="#c9965b" />
        <ContactShadows position={[0, 0.002, 0]} scale={1.6} blur={2.6} far={0.9} opacity={0.55} resolution={256} />
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
        <Icon name="reset" size={20} />
      </button>
    </div>
  );
}
