// «Лента» — фирменный индикатор прогресса Канона: деления мерной ленты вместо колец и дуг.
import type { ReactNode } from 'react';

const TICKS = 41; // 40 промежутков: каждое пятое деление выше, как на сантиметровой ленте

export function Tape({
  label,
  value,
  max,
  caption,
  ariaText,
}: {
  /** Что измеряем — слева над лентой */
  label: ReactNode;
  /** Текущее значение и цель в одних единицах */
  value: number;
  max: number;
  /** Число справа над лентой, например «1 840 / 2 400 ккал» */
  caption: ReactNode;
  /** Текст для экранного диктора */
  ariaText: string;
}) {
  const ratio = max > 0 ? Math.max(0, value / max) : 0;
  const over = ratio > 1.05; // небольшое превышение цели — не повод красить ленту
  const filled = Math.round(Math.min(1, ratio) * (TICKS - 1));
  return (
    <div className="tape">
      <div className="tape-head">
        <span className="tape-label">{label}</span>
        <span className="tape-caption">{caption}</span>
      </div>
      <div className={`tape-scale${over ? ' tape-over' : ''}`} role="img" aria-label={ariaText}>
        {Array.from({ length: TICKS }, (_, i) => (
          <i key={i} className={`${i % 5 === 0 ? 'major' : ''}${i <= filled && ratio > 0 ? ' on' : ''}`} />
        ))}
      </div>
    </div>
  );
}
