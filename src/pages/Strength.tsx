import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { getDb } from '../lib/data/db';
import { Card, fmt, fmtDate, useToast, Empty, Sheet, pickFile } from '../components/ui';
import { LineChart, Bars } from '../components/Chart';
import { previewImport, type WorkoutSet } from '../lib/hevy/hevy';
import { personalRecords, e1rmSeries, weeklyTonnage, groupWorkouts, isWorking, weekStart, STRENGTH_PATTERNS } from '../lib/hevy/training';
import { lookupExercise, alternativesFor, CORE_STABILITY, MUSCLE_RU, PATTERN_RU, EQUIPMENT_RU, type Muscle, type Pattern, type Equipment, type RiskTag } from '../lib/hevy/exercises';
import { overrideMap } from '../lib/derive';
import { addDays } from '../lib/calc/trend';
import { readTable, type Table } from '../lib/import/table';
import { detectWorkouts, parseWorkoutTable, WORKOUT_FIELDS, SOURCE_RU, type DetectedWorkouts } from '../lib/import/workouts';
import { MappingEditor } from '../components/ImportMapping';
import { activeFlags, flagsForTags } from '../lib/health';

interface Pending {
  name: string;
  text: string;
  table: Table;
  det: DetectedWorkouts;
  unit: 'kg' | 'lbs';
  keys: Set<string>;
}

export function Strength() {
  const { sets, d, settings, overrides } = useStore();
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null>(null);
  const ov = useMemo(() => overrideMap(overrides), [overrides]);
  const prs = useMemo(() => personalRecords(sets), [sets]);
  const [exercise, setExercise] = useState<string>('');
  const ex = exercise || prs[0]?.exercise || '';
  const series = useMemo(() => (ex ? e1rmSeries(sets, ex) : []), [sets, ex]);
  const tonnage = useMemo(
    () => Object.entries(weeklyTonnage(sets)).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })),
    [sets],
  );
  const workouts = useMemo(() => groupWorkouts(sets).slice(0, 8), [sets]);
  const exercises = useMemo(() => [...new Set(sets.map((s) => s.exercise))].sort(), [sets]);
  const unmapped = exercises.filter((e) => !lookupExercise(e, ov) && sets.some((s) => s.exercise === e && s.weightKg));
  const [editEx, setEditEx] = useState('');

  // Превью пересчитывается при каждой правке сопоставления или единиц
  const parsed = useMemo(() => {
    if (!pending) return null;
    try {
      const r = parseWorkoutTable(pending.table, pending.text, pending.det, { unit: pending.unit });
      return { ...r, preview: previewImport(r.rows, pending.keys), error: null as string | null };
    } catch (e) {
      return { rows: [] as WorkoutSet[], errors: [] as string[], warnings: [] as string[], preview: null, error: (e as Error).message };
    }
  }, [pending]);

  const doImport = async () => {
    const f = await pickFile('.csv,.tsv,.txt,text/csv,text/tab-separated-values');
    if (!f) return;
    try {
      const text = await f.text();
      const table = readTable(text);
      const det = detectWorkouts(table);
      const keys = new Set((await getDb().sets.toCollection().primaryKeys()) as string[]);
      setPending({ name: f.name, text, table, det, unit: det.unitKnown ?? 'kg', keys });
    } catch (e) {
      toast(`Файл не прочитан: ${(e as Error).message}`);
    }
  };
  const confirm_ = async () => {
    if (!parsed?.rows.length) return;
    const db = getDb();
    const keys = new Set((await db.sets.toCollection().primaryKeys()) as string[]);
    const seen = new Set<string>();
    const fresh = parsed.rows.filter((r) => !keys.has(r.key) && !seen.has(r.key) && seen.add(r.key));
    await db.sets.bulkPut(fresh);
    setPending(null);
    toast(`Добавлено подходов: ${fresh.length}`);
  };

  const wk = d.weekly.all[addDays(weekStart(d.now), -7)] ?? {};
  const avg = d.weekly.avg ?? {};
  const fourWeeksAgo = addDays(d.now, -28);
  const recent = [...new Set(sets.filter((s) => s.start.slice(0, 10) >= fourWeeksAgo && isWorking(s)).map((s) => s.exercise))];
  const flagged = activeFlags(settings.healthFlags)
    .map((f) => ({ f, ex: recent.filter((e) => (lookupExercise(e, ov)?.tags ?? []).some((t) => f.tags.includes(t))) }))
    .filter((x) => x.ex.length);

  return (
    <div>
      <div className="spread">
        <h1>Силовые</h1>
        <button className="btn btn-primary" onClick={doImport}>
          Импорт тренировок
        </button>
      </div>
      <details className="tiny muted" style={{ marginBottom: 10 }}>
        <summary>Откуда можно импортировать</summary>
        Подходит CSV/TSV из любого приложения: Hevy (Профиль → Настройки → Export Workouts), Strong (Настройки → Export Data), FitNotes (Settings → Backup → Export to CSV) или своя таблица из Excel / Google Таблиц с колонками «дата, упражнение, вес, повторы». Колонки распознаются автоматически, в превью их можно поправить. Повторный импорт не создаёт дублей.
      </details>

      {sets.length === 0 ? (
        <Card>
          <Empty>Тренировок пока нет. Импортируйте CSV из своего приложения — посчитаем подходы на мышцу, рекорды и расчётный 1ПМ.</Empty>
        </Card>
      ) : (
        <>
          <Card title="Ключевые движения" extra={<span className="tiny muted">лучшее за 120 дней</span>}>
            {Object.keys(d.patterns).length === 0 ? (
              <Empty>Нет подходов до 10 повторов с весом в жимах, приседах и тягах. {!d.values.weight && 'И нужен вес тела в замерах.'}</Empty>
            ) : (
              <div className="scroll-x">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Движение</th>
                      <th>Лучшее упражнение</th>
                      <th>1ПМ</th>
                      <th>× вес</th>
                      <th>Балл</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STRENGTH_PATTERNS.map((p: Pattern) => {
                      const b = d.patterns[p];
                      return (
                        <tr key={p}>
                          <td>{PATTERN_RU[p]}</td>
                          <td style={{ textAlign: 'left' }}>
                            {b ? (
                              <>
                                {b.exercise} <span className="muted">({EQUIPMENT_RU[lookupExercise(b.exercise, ov)?.equipment ?? 'other']})</span>
                              </>
                            ) : (
                              <span className="muted">нет данных</span>
                            )}
                          </td>
                          <td>{b ? fmt(b.e1rm, 0) : '—'}</td>
                          <td>{b ? fmt(b.ratio, 2) : '—'}</td>
                          <td style={{ color: b ? (b.score >= 70 ? 'var(--good)' : b.score >= 35 ? 'var(--warn)' : 'var(--bad)') : undefined }}>{b ? fmt(b.score, 0) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="tiny muted" style={{ marginTop: 6 }}>
              Штанга, гантели (вес одной гантели), Смит и тренажёры — у каждого свой ориентир «новичок → элита» (эвристика: у тренажёров разных марок вес отличается). Подтягивания: (вес тела + отягощение) / вес. 1ПМ — среднее Epley и Brzycki, только подходы до 10 повторов. Силовой балл уровня — среднее по движениям{d.strengthSum ? `: ${fmt(d.strengthSum.score, 0)} / 100` : ''}.
            </p>
          </Card>

          {flagged.length > 0 && (
            <Card title="⚠ Ограничения по здоровью" className="banner-warn">
              <ul className="list tiny">
                {flagged.map(({ f, ex: list }) => (
                  <li key={f.key}>
                    <b>{f.label}</b>: {list.slice(0, 5).join(', ')}
                    <div className="muted">
                      Взамен: {[...new Set(list.slice(0, 2).flatMap(alternativesFor))].slice(0, 4).join(', ')}. {f.advice.join('. ')}.
                    </div>
                  </li>
                ))}
              </ul>
              {flagged.some(({ f }) => ['hyperlordosis', 'lowBackPain', 'disc', 'scoliosis'].includes(f.key)) && <p className="tiny">Стабилизация кора: {CORE_STABILITY.join(', ')}.</p>}
              <p className="tiny muted">Это подсказки, а не диагноз. Боль ≥ 3/10, онемение, головокружение — прекратите упражнение и обратитесь к врачу.</p>
            </Card>
          )}

          <Card title="Рабочие подходы на мышцу" extra={<span className="tiny muted">среднее за 2 нед.</span>}>
            <Bars
              band={[10, 20]}
              max={26}
              data={(Object.keys(MUSCLE_RU) as Muscle[])
                .filter((m) => (wk[m] ?? 0) > 0 || (avg[m] ?? 0) > 0)
                .map((m) => ({ label: `${MUSCLE_RU[m]} (прошлая нед.: ${fmt(wk[m] ?? 0, 1)})`, value: avg[m] ?? 0 }))}
            />
            <p className="tiny muted" style={{ marginTop: 6 }}>
              Зелёный — 10–20 подходов в неделю (Schoenfeld et al., 2017). Основная мышца = 1 подход, вспомогательная = 0,5 (условность). Разминка не считается.
            </p>
          </Card>

          {tonnage.length >= 2 && (
            <Card title="Тоннаж по неделям">
              <LineChart unit="кг" series={[{ label: 'Тоннаж (вес × повторы)', points: tonnage, color: 'var(--accent)', dots: true }]} />
            </Card>
          )}

          <Card title="Расчётный 1ПМ">
            <select value={ex} onChange={(e) => setExercise(e.target.value)} aria-label="Упражнение">
              {prs.map((p) => (
                <option key={p.exercise} value={p.exercise}>
                  {p.exercise}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 8 }}>
              <LineChart unit="кг" series={[{ label: 'Лучший расч. 1ПМ за тренировку', points: series, color: 'var(--accent)', dots: true }]} />
            </div>
            {d.strength.filter((s) => s.dropPct > 3).length > 0 && (
              <p className="tiny" style={{ color: 'var(--warn)' }}>
                Падение: {d.strength.filter((s) => s.dropPct > 3).map((s) => `${s.exercise} −${fmt(s.dropPct, 1)} %`).join(', ')} (последние 4 нед. против предыдущих 8).
              </p>
            )}
          </Card>

          <Card title="Рекорды">
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Упражнение</th>
                    <th>Макс. вес</th>
                    <th>Расч. 1ПМ</th>
                    <th>Подходов</th>
                  </tr>
                </thead>
                <tbody>
                  {prs.slice(0, 15).map((p) => (
                    <tr key={p.exercise}>
                      <td>
                        {p.exercise}
                        {flagsForTags(lookupExercise(p.exercise, ov)?.tags, settings.healthFlags).length ? ' ⚠' : ''}
                      </td>
                      <td>{fmt(p.heaviest, 1)}</td>
                      <td>{fmt(p.bestE1rm, 1)}</td>
                      <td>{p.sets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Мышцы для упражнений">
            {unmapped.length > 0 && <p className="tiny" style={{ color: 'var(--warn)' }}>Не распознаны (не входят в подсчёт подходов): {unmapped.join(', ')}</p>}
            <select value={editEx} onChange={(e) => setEditEx(e.target.value)} aria-label="Упражнение для правки">
              <option value="">— выберите упражнение —</option>
              {exercises.map((e) => (
                <option key={e} value={e}>
                  {e}
                  {!lookupExercise(e, ov) ? ' (не распознано)' : ov[e] ? ' (ручная правка)' : ''}
                </option>
              ))}
            </select>
            {editEx && <ExerciseEditor key={editEx} title={editEx} />}
          </Card>

          <Card title="Последние тренировки">
            <ul className="list">
              {workouts.map((w) => {
                const work = w.sets.filter(isWorking);
                return (
                  <li key={w.start}>
                    <div className="spread">
                      <b>{w.title || 'Тренировка'}</b>
                      <span className="tiny muted">{fmtDate(w.start)}</span>
                    </div>
                    <div className="tiny muted">
                      {[...new Set(work.map((s) => s.exercise))].join(' · ')} — {work.length} рабочих подходов
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}

      <Sheet open={!!pending} onClose={() => setPending(null)} title="Импорт тренировок">
        {pending && parsed && (
          <div className="stack">
            <p className="tiny">
              Файл: <b>{pending.name}</b> · похоже на: <b>{SOURCE_RU[pending.det.source]}</b> · строк: {pending.table.rows.length}
            </p>
            {pending.det.source !== 'hevy' && !pending.det.unitKnown && (
              <label className="field">
                <span className="field-label">Единица веса в файле</span>
                <select value={pending.unit} onChange={(e) => setPending({ ...pending, unit: e.target.value as 'kg' | 'lbs' })}>
                  <option value="kg">килограммы</option>
                  <option value="lbs">фунты (пересчитать в кг)</option>
                </select>
              </label>
            )}
            {pending.det.source !== 'hevy' && (
              <details open={pending.det.source === 'generic' || !!parsed.error}>
                <summary>Сопоставление колонок</summary>
                <MappingEditor table={pending.table} fields={WORKOUT_FIELDS} mapping={pending.det.mapping} onChange={(m) => setPending({ ...pending, det: { ...pending.det, mapping: m } })} />
              </details>
            )}
            {parsed.error ? (
              <p className="field-error">{parsed.error}</p>
            ) : (
              parsed.preview && (
                <table className="tbl">
                  <tbody>
                    <tr>
                      <td>Тренировок в файле</td>
                      <td>{parsed.preview.workouts}</td>
                    </tr>
                    <tr>
                      <td>Новых тренировок</td>
                      <td style={{ color: 'var(--good)' }}>{parsed.preview.newWorkouts}</td>
                    </tr>
                    <tr>
                      <td>Уже импортированы (дубли)</td>
                      <td>{parsed.preview.duplicateWorkouts}</td>
                    </tr>
                    <tr>
                      <td>Подходов новых / дублей</td>
                      <td>
                        {parsed.preview.newSets} / {parsed.preview.duplicateSets}
                      </td>
                    </tr>
                    <tr>
                      <td>Разминочных (не в объёме)</td>
                      <td>{parsed.preview.warmupSets}</td>
                    </tr>
                  </tbody>
                </table>
              )
            )}
            {parsed.rows.length > 0 && (
              <p className="tiny muted">
                Пример: {fmtDate(parsed.rows[0].start)} · {parsed.rows[0].exercise} · {parsed.rows[0].weightKg ?? '—'} кг × {parsed.rows[0].reps ?? '—'}
              </p>
            )}
            {parsed.warnings.map((w) => (
              <p key={w} className="tiny" style={{ color: 'var(--warn)' }}>
                {w}
              </p>
            ))}
            {parsed.errors.length > 0 && (
              <details>
                <summary style={{ color: 'var(--warn)' }}>Пропущено строк: {parsed.errors.length}</summary>
                <ul className="tiny">
                  {parsed.errors.slice(0, 20).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
            <button className="btn btn-primary btn-block" disabled={!parsed.preview || parsed.preview.newSets === 0} onClick={confirm_}>
              {!parsed.preview ? 'Поправьте сопоставление' : parsed.preview.newSets === 0 ? 'Нового нет' : `Добавить ${parsed.preview.newSets} подходов`}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

const TAG_RU: Record<RiskTag, string> = {
  axial: 'осевая нагрузка на позвоночник',
  lumbarExtension: 'переразгибание поясницы',
  spinalFlexion: 'скручивание / сгибание позвоночника',
  overhead: 'руки над головой под весом',
  shoulderImpingement: 'риск для плеча (протяжки, брусья, из-за головы)',
  deepKnee: 'глубокое сгибание колена под весом',
  kneeShear: 'сдвиг в колене (разгибания ног)',
  wristLoad: 'нагрузка на запястья',
  valsalva: 'тяжело, с задержкой дыхания',
  impact: 'удары / прыжки / бег',
  neckLoad: 'нагрузка на шею',
};

function ExerciseEditor({ title }: { title: string }) {
  const { overrides } = useStore();
  const toast = useToast();
  const cur = lookupExercise(title, overrideMap(overrides));
  const [primary, setPrimary] = useState<Muscle[]>(cur?.primary ?? []);
  const [secondary, setSecondary] = useState<Muscle[]>(cur?.secondary ?? []);
  const [pattern, setPattern] = useState<Pattern>(cur?.pattern ?? 'isolation');
  const [equipment, setEquipment] = useState<Equipment>(cur?.equipment ?? 'other');
  const [tags, setTags] = useState<RiskTag[]>(cur?.tags ?? []);
  const toggle = <T,>(list: T[], set: (m: T[]) => void, m: T) => set(list.includes(m) ? list.filter((x) => x !== m) : [...list, m]);
  const isOverride = overrides.some((o) => o.title === title);
  return (
    <div style={{ marginTop: 10 }}>
      <p className="tiny muted">{cur ? 'Распознано автоматически — поправьте, если не так.' : 'Не распознано — укажите мышцы, и упражнение попадёт в подсчёт объёма.'}</p>
      <div className="tiny muted">Основные мышцы (1 подход)</div>
      <div className="row" style={{ marginBottom: 8 }}>
        {(Object.keys(MUSCLE_RU) as Muscle[]).map((m) => (
          <button key={m} type="button" className={`btn btn-small ${primary.includes(m) ? 'btn-primary' : ''}`} onClick={() => toggle(primary, setPrimary, m)}>
            {MUSCLE_RU[m]}
          </button>
        ))}
      </div>
      <div className="tiny muted">Вспомогательные (0,5)</div>
      <div className="row" style={{ marginBottom: 8 }}>
        {(Object.keys(MUSCLE_RU) as Muscle[]).map((m) => (
          <button key={m} type="button" className={`btn btn-small ${secondary.includes(m) ? 'btn-primary' : ''}`} onClick={() => toggle(secondary, setSecondary, m)}>
            {MUSCLE_RU[m]}
          </button>
        ))}
      </div>
      <div className="grid2">
        <label className="field">
          <span className="field-label">Тип движения</span>
          <select value={pattern} onChange={(e) => setPattern(e.target.value as Pattern)}>
            {(Object.keys(PATTERN_RU) as Pattern[]).map((p) => (
              <option key={p} value={p}>
                {PATTERN_RU[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Оборудование</span>
          <select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
            {(Object.keys(EQUIPMENT_RU) as Equipment[]).map((p) => (
              <option key={p} value={p}>
                {EQUIPMENT_RU[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="tiny muted" style={{ marginTop: 8 }}>
        Риски (для ограничений по здоровью)
      </div>
      <div className="stack">
        {(Object.keys(TAG_RU) as RiskTag[]).map((t) => (
          <label key={t} className="row tiny">
            <input type="checkbox" checked={tags.includes(t)} onChange={() => toggle(tags, setTags, t)} /> {TAG_RU[t]}
          </label>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button
          className="btn btn-primary"
          disabled={!primary.length}
          onClick={async () => {
            await getDb().exerciseOverrides.put({ title, primary, secondary, pattern, equipment, tags, axial: tags.includes('axial') });
            toast('Сохранено');
          }}
        >
          Сохранить
        </button>
        {isOverride && (
          <button
            className="btn"
            onClick={async () => {
              await getDb().exerciseOverrides.delete(title);
              toast('Вернул справочник по умолчанию');
            }}
          >
            Сбросить правку
          </button>
        )}
      </div>
    </div>
  );
}
