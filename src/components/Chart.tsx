// Лёгкий SVG-график временных рядов (без библиотек).
import { useId, useState } from 'react';
import { toMs } from '../lib/calc/trend';

export interface Series {
  label: string;
  points: Array<{ date: string; value: number }>;
  color: string;
  dashed?: boolean;
  dots?: boolean;
}

export function LineChart({ series, height = 160, unit = '', target, yPad = 0.08 }: { series: Series[]; height?: number; unit?: string; target?: number; yPad?: number }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return <div className="empty tiny">Нужно минимум 2 точки для графика</div>;
  const W = 340;
  const H = height;
  const P = { l: 34, r: 8, t: 8, b: 20 };
  const xs = all.map((p) => toMs(p.date));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  let y0 = Math.min(...all.map((p) => p.value), target ?? Infinity);
  let y1 = Math.max(...all.map((p) => p.value), target ?? -Infinity);
  const pad = (y1 - y0 || 1) * yPad;
  y0 -= pad;
  y1 += pad;
  const sx = (d: string) => P.l + ((toMs(d) - x0) / (x1 - x0 || 1)) * (W - P.l - P.r);
  const sy = (v: number) => P.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - P.t - P.b);
  const ticks = [y0 + pad, (y0 + y1) / 2, y1 - pad];
  const fmtD = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  const main = series[0].points;
  const hp = hover !== null ? main[hover] : null;
  return (
    <div>
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={id}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          let best = 0;
          main.forEach((p, i) => {
            if (Math.abs(sx(p.date) - x) < Math.abs(sx(main[best].date) - x)) best = i;
          });
          setHover(best);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <title id={id}>{series.map((s) => s.label).join(', ')}</title>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={P.l - 4} y={sy(t) + 3} textAnchor="end">
              {t.toLocaleString('ru-RU', { maximumFractionDigits: Math.abs(y1 - y0) < 10 ? 1 : 0, minimumFractionDigits: Math.abs(y1 - y0) < 10 ? 1 : 0 })}
            </text>
          </g>
        ))}
        {target !== undefined && <line x1={P.l} x2={W - P.r} y1={sy(target)} y2={sy(target)} stroke="var(--accent)" strokeDasharray="4 4" strokeWidth="1" />}
        {series.map((s) => (
          <g key={s.label}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth={s.dashed ? 1.5 : 2.2}
              strokeDasharray={s.dashed ? '3 3' : undefined}
              strokeLinejoin="round"
              points={s.points.map((p) => `${sx(p.date)},${sy(p.value)}`).join(' ')}
            />
            {s.dots && s.points.map((p) => <circle key={p.date} cx={sx(p.date)} cy={sy(p.value)} r="2.2" fill={s.color} />)}
          </g>
        ))}
        <text x={P.l} y={H - 4}>
          {fmtD(new Date(x0).toISOString())}
        </text>
        <text x={W - P.r} y={H - 4} textAnchor="end">
          {fmtD(new Date(x1).toISOString())}
        </text>
        {hp && (
          <g>
            <line x1={sx(hp.date)} x2={sx(hp.date)} y1={P.t} y2={H - P.b} stroke="var(--muted)" strokeWidth="1" />
            <circle cx={sx(hp.date)} cy={sy(hp.value)} r="4" fill={series[0].color} />
          </g>
        )}
      </svg>
      <div className="spread">
        <div className="legend">
          {series.map((s) => (
            <span key={s.label}>
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
        {hp && (
          <span className="tiny">
            {fmtD(hp.date)}: <b>{hp.value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}</b> {unit}
          </span>
        )}
      </div>
    </div>
  );
}

export function Bars({ data, max, band }: { data: Array<{ label: string; value: number }>; max?: number; band?: [number, number] }) {
  const m = max ?? Math.max(1, ...data.map((d) => d.value), band?.[1] ?? 0);
  return (
    <div className="stack">
      {data.map((d) => {
        const tone = band ? (d.value < band[0] ? 'var(--warn)' : d.value > band[1] ? 'var(--bad)' : 'var(--good)') : 'var(--accent)';
        return (
          <div key={d.label}>
            <div className="spread tiny">
              <span>{d.label}</span>
              <span>{d.value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}</span>
            </div>
            <div className="progress" style={{ position: 'relative' }}>
              <div style={{ width: `${Math.min(100, (d.value / m) * 100)}%`, background: tone }} />
              {band && (
                <span
                  style={{ position: 'absolute', top: 0, bottom: 0, left: `${(band[0] / m) * 100}%`, width: `${((band[1] - band[0]) / m) * 100}%`, borderLeft: '1px solid var(--muted)', borderRight: '1px solid var(--muted)' }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
