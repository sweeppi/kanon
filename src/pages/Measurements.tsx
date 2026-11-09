import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { getDb, MEASURE_FIELDS, type Measurement, type MeasureField } from '../lib/data/db';
import { FIELDS, FIELD_BY_KEY, STANDARD_RULE, type FieldMeta } from '../lib/measureMeta';
import { Card, NumField, fmt, fmtDate, useToast, Empty, Sheet, pickFile } from '../components/ui';
import { LineChart } from '../components/Chart';
import { ema } from '../lib/calc/trend';
import { today } from '../lib/derive';
import { parseHevyMeasurements, FormatError, type ImportedMeasurement } from '../lib/hevy/hevy';
import { Photos } from '../components/Photos';

const DRAFT_KEY = 'kanon.measureDraft';

function MeasureFigure({ fig }: { fig: NonNullable<FieldMeta['fig']> }) {
  return (
    <svg className="hint-fig" viewBox="0 0 60 140" width="42" height="98" aria-hidden="true">
      <g fill="currentColor" opacity=".28">
        <circle cx="30" cy="11" r="8" />
        <rect x="26" y="18" width="8" height="7" />
        <path d="M14 27 Q30 22 46 27 L44 68 L46 80 L14 80 L16 68 Z" />
        <path d="M14 28 L8 60 L10 74 L14 74 L18 40 Z" />
        <path d="M46 28 L52 60 L50 74 L46 74 L42 40 Z" />
        <path d="M15 80 L29 80 L28 136 L20 136 Z" />
        <path d="M31 80 L45 80 L40 136 L32 136 Z" />
      </g>
      <line x1={fig.x1} x2={fig.x2} y1={fig.y + (fig.tilt ?? 0) / 2} y2={fig.y - (fig.tilt ?? 0) / 2} stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

type Draft = { date: string } & Partial<Record<MeasureField, number>> & { note?: string };

export function Measurements() {
  const { ms, d } = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const s = localStorage.getItem(DRAFT_KEY);
      if (s) return JSON.parse(s) as Draft;
    } catch {
      /* нет доступа к хранилищу */
    }
    return { date: today() };
  });
  const [openHint, setOpenHint] = useState<MeasureField | null>(null);
  const [chartField, setChartField] = useState<MeasureField>('weight');
  const [cmpA, setCmpA] = useState('');
  const [cmpB, setCmpB] = useState('');
  const [importRows, setImportRows] = useState<ImportedMeasurement[] | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* приватный режим: черновик живёт только в памяти */
    }
  }, [draft]);

  const filled = MEASURE_FIELDS.filter((f) => draft[f] !== undefined);
  const save = async () => {
    if (!draft.date) return toast('Укажите дату');
    if (!filled.length) return toast('Заполните хотя бы одно поле');
    // Снимок формы и мгновенный сброс: следующий ввод не смешается с сохраняемым замером.
    const snapshot = draft;
    setDraft({ date: snapshot.date });
    try {
      const db = getDb();
      const existing = await db.measurements.where('date').equals(snapshot.date).first();
      const row: Measurement = { ...(existing ?? {}), ...snapshot };
      if (existing?.id) await db.measurements.put({ ...row, id: existing.id });
      else await db.measurements.add(row);
      toast(existing ? `Замер за ${fmtDate(snapshot.date)} дополнен` : `Замер за ${fmtDate(snapshot.date)} сохранён`);
    } catch (e) {
      setDraft(snapshot); // возвращаем введённое
      toast(`Не сохранилось: ${(e as Error).message}. Данные формы остались.`);
    }
  };

  const sorted = useMemo(() => [...ms].sort((a, b) => b.date.localeCompare(a.date)), [ms]);
  const series = useMemo(() => ms.filter((m) => m[chartField] !== undefined).map((m) => ({ date: m.date, value: m[chartField]! })), [ms, chartField]);
  const dates = sorted.map((m) => m.date);
  const A = sorted.find((m) => m.date === (cmpA || dates[dates.length - 1]));
  const B = sorted.find((m) => m.date === (cmpB || dates[0]));

  const importHevy = async () => {
    const f = await pickFile('.csv,.tsv,.txt,text/csv');
    if (!f) return;
    try {
      const r = parseHevyMeasurements(await f.text());
      setImportRows(r.rows);
      setImportErrors(r.errors);
    } catch (e) {
      toast(e instanceof FormatError ? e.message : `Ошибка чтения: ${(e as Error).message}`);
    }
  };
  const confirmImport = async () => {
    if (!importRows) return;
    const db = getDb();
    let added = 0;
    let merged = 0;
    await db.transaction('rw', db.measurements, async () => {
      for (const r of importRows) {
        const ex = await db.measurements.where('date').equals(r.date).first();
        if (ex?.id) {
          // ручные значения не перезаписываем — дополняем пустые поля
          const patch: Partial<Measurement> = {};
          for (const [k, v] of Object.entries(r.values)) if ((ex as Record<string, unknown>)[k] === undefined) (patch as Record<string, number>)[k] = v;
          if (Object.keys(patch).length) {
            await db.measurements.update(ex.id, patch);
            merged++;
          }
        } else {
          await db.measurements.add({ date: r.date, ...r.values });
          added++;
        }
      }
    });
    setImportRows(null);
    toast(`Импорт: новых дат ${added}, дополнено ${merged}`);
  };

  return (
    <div>
      <h1>Замеры</h1>
      <div className="banner tiny">
        <b>Правило стандартизации.</b> {STANDARD_RULE}
      </div>

      <Card title="Новый замер" extra={<button className="btn btn-small" onClick={importHevy}>Импорт из Hevy</button>}>
        <label className="field" style={{ marginBottom: 10 }}>
          <span className="field-label">Дата</span>
          <input type="date" value={draft.date} max={today()} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        </label>
        <div className="grid2">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <NumField
                label={
                  <span>
                    {f.label}{' '}
                    <button
                      type="button"
                      className="badge"
                      style={{ cursor: 'pointer' }}
                      aria-label={`Как мерить: ${f.label}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setOpenHint(openHint === f.key ? null : f.key);
                      }}
                    >
                      ?
                    </button>
                  </span>
                }
                ariaLabel={`${f.label}, ${f.unit}`}
                unit={f.unit}
                min={f.min}
                max={f.max}
                value={draft[f.key]}
                placeholder={d.values[f.key] !== undefined ? `было ${String(d.values[f.key]).replace('.', ',')}` : ''}
                onChange={(v) => setDraft({ ...draft, [f.key]: v })}
              />
              {openHint === f.key && (
                <div className="tiny" style={{ marginTop: 4, overflow: 'hidden' }}>
                  {f.fig && <MeasureFigure fig={f.fig} />}
                  {f.hint}
                </div>
              )}
            </div>
          ))}
        </div>
        <label className="field" style={{ marginTop: 10 }}>
          <span className="field-label">Заметка</span>
          <input value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value || undefined })} placeholder="например: после отпуска" />
        </label>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={save}>
            Сохранить ({filled.length})
          </button>
          {filled.length > 0 && (
            <button className="btn" onClick={() => setDraft({ date: draft.date })}>
              Очистить форму
            </button>
          )}
        </div>
        <p className="tiny muted" style={{ marginTop: 6 }}>Можно вносить не все поля: для расчётов берётся последнее известное значение каждого.</p>
      </Card>

      <Card title="График">
        <select value={chartField} onChange={(e) => setChartField(e.target.value as MeasureField)} aria-label="Показатель для графика">
          {FIELDS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <div style={{ marginTop: 8 }}>
          <LineChart
            unit={FIELD_BY_KEY[chartField].unit}
            series={
              chartField === 'weight'
                ? [
                    { label: 'Тренд EMA', points: ema(series), color: 'var(--accent)' },
                    { label: 'Факт', points: series, color: 'var(--muted)', dashed: true, dots: true },
                  ]
                : [{ label: FIELD_BY_KEY[chartField].label, points: series, color: 'var(--accent)', dots: true }]
            }
          />
        </div>
      </Card>

      {sorted.length >= 2 && (
        <Card title="Сравнение двух дат">
          <div className="grid2">
            <select value={A?.date} onChange={(e) => setCmpA(e.target.value)} aria-label="Дата A">
              {dates.map((x) => (
                <option key={x} value={x}>
                  {fmtDate(x)}
                </option>
              ))}
            </select>
            <select value={B?.date} onChange={(e) => setCmpB(e.target.value)} aria-label="Дата B">
              {dates.map((x) => (
                <option key={x} value={x}>
                  {fmtDate(x)}
                </option>
              ))}
            </select>
          </div>
          <table className="tbl" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Поле</th>
                <th>A</th>
                <th>B</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.filter((f) => A?.[f.key] !== undefined || B?.[f.key] !== undefined).map((f) => {
                const a = A?.[f.key];
                const b = B?.[f.key];
                const diff = a !== undefined && b !== undefined ? b - a : null;
                return (
                  <tr key={f.key}>
                    <td>{f.label}</td>
                    <td>{fmt(a, 1)}</td>
                    <td>{fmt(b, 1)}</td>
                    <td>{diff == null ? '—' : `${diff > 0 ? '+' : ''}${fmt(diff, 1)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Photos />

      <Card title="История">
        {sorted.length === 0 ? (
          <Empty>Пока нет замеров. Начните с веса, шеи и талии — этого хватит для % жира.</Empty>
        ) : (
          <ul className="list">
            {sorted.map((m) => (
              <li key={m.id} className="spread">
                <div>
                  <b>{fmtDate(m.date)}</b>
                  <div className="tiny muted">
                    {FIELDS.filter((f) => m[f.key] !== undefined)
                      .map((f) => `${f.label.toLowerCase()} ${String(m[f.key]).replace('.', ',')}`)
                      .join(' · ')}
                    {m.note ? ` · «${m.note}»` : ''}
                  </div>
                </div>
                <div className="row">
                  <button className="btn btn-small" onClick={() => setDraft({ ...(m as Draft), date: m.date })} aria-label="Редактировать">
                    ✎
                  </button>
                  <button
                    className="btn btn-small btn-danger"
                    aria-label="Удалить"
                    onClick={async () => {
                      if (confirm(`Удалить замер за ${fmtDate(m.date)}? Это необратимо.`)) {
                        await getDb().measurements.delete(m.id!);
                        toast('Замер удалён');
                      }
                    }}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet open={!!importRows} onClose={() => setImportRows(null)} title="Импорт замеров Hevy">
        {importRows && (
          <>
            <p>
              Найдено дат: <b>{importRows.length}</b>. Уже есть в базе: {importRows.filter((r) => ms.some((m) => m.date === r.date)).length} (их пустые поля будут дополнены, ваши значения не перезаписываются).
            </p>
            {importErrors.length > 0 && <p className="tiny" style={{ color: 'var(--warn)' }}>Пропущено строк: {importErrors.length}. {importErrors.slice(0, 3).join('; ')}</p>}
            <p className="tiny muted">Формат файла замеров Hevy не документирован: колонки распознаются по названиям (weight, waist, chest…). Проверьте результат.</p>
            <button className="btn btn-primary btn-block" onClick={confirmImport}>
              Импортировать
            </button>
          </>
        )}
      </Sheet>
    </div>
  );
}
