// Ленивая загрузка 3D (three.js ≈ 0.9 МБ) отдельным чанком, чтобы остальное приложение открывалось быстро.
import { lazy, Suspense } from 'react';
import type { Body3DProps } from './Body3D';

const LazyBody3D = lazy(() => import('./Body3D'));

export function Body3DSlot(props: Body3DProps) {
  return (
    <Suspense fallback={<div className="body-poster">Загрузка 3D…</div>}>
      <LazyBody3D {...props} />
    </Suspense>
  );
}
