// Мелкие UI-компоненты без зависимостей.
import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

/** Заголовок экрана: название шрифтом Forum, под ним — необязательная строка, справа — действие. */
export function ScreenHead({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <header className="screen-head">
      <div>
        <h1 className="display">{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </header>
  );
}

/** Сворачиваемая карточка: справочные таблицы, методики и редкие настройки не занимают первый экран. */
export function Fold({ title, children, open }: { title: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="card" open={open}>
      <summary>
        <span>{title}</span>
        <Icon name="chevron" size={20} />
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

/** Кнопка-иконка 44 × 44: подпись для экранного диктора обязательна. */
export function IconButton({ icon, label, tone, ...rest }: { icon: IconName; label: string; tone?: 'danger' | 'primary' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`iconbtn${tone ? ` iconbtn-${tone}` : ''}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={20} />
    </button>
  );
}

export const fmt = (x: number | null | undefined, d = 1) =>
  x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}.${m}.${y}`;
};

export function Card({ title, extra, children, className = '' }: { title?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || extra) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {extra}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={tone ? { color: `var(--${tone})` } : undefined}>
        {value}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** Числовое поле: хранит «черновик» строки, чтобы ввод не терялся при ошибке. */
export function NumField({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  step = 0.1,
  hint,
  placeholder,
  ariaLabel,
}: {
  ariaLabel?: string;
  label: ReactNode;
  value: number | undefined | null;
  onChange: (v: number | undefined) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  hint?: ReactNode;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value).replace('.', ','));
  useEffect(() => {
    const parsed = parseFloat(draft.replace(',', '.'));
    if ((value ?? undefined) !== (Number.isFinite(parsed) ? parsed : undefined)) setDraft(value == null ? '' : String(value).replace('.', ','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const parsed = draft.trim() === '' ? undefined : Number(draft.replace(',', '.').replace(/\s/g, ''));
  let error: string | null = null;
  if (parsed !== undefined && !Number.isFinite(parsed)) error = 'Введите число';
  else if (parsed !== undefined && min !== undefined && parsed < min) error = `Минимум ${min}`;
  else if (parsed !== undefined && max !== undefined && parsed > max) error = `Максимум ${max}`;
  return (
    <label className="field">
      <span className="field-label">
        <span>{label}</span>
        {unit && <span>{unit}</span>}
      </span>
      <input
        inputMode="decimal"
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        value={draft}
        placeholder={placeholder}
        step={step}
        className={error ? 'invalid' : ''}
        aria-invalid={!!error}
        onChange={(e) => {
          const s = e.target.value;
          setDraft(s);
          const n = s.trim() === '' ? undefined : Number(s.replace(',', '.').replace(/\s/g, ''));
          if (n === undefined) onChange(undefined);
          else if (Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n);
        }}
      />
      {error && <div className="field-error">{error}</div>}
      {hint && !error && <div className="tiny muted" style={{ marginTop: 3 }}>{hint}</div>}
    </label>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, ReactNode]>; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <IconButton icon="close" label="Закрыть" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/** Чтение файла, выбранного пользователем. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}
