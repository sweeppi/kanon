import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { getDb } from '../lib/data/db';
import { Card, Stat, fmt, fmtDate, useToast, Empty, Sheet, pickFile } from '../components/ui';
import { LineChart, Bars } from '../components/Chart';
import { parseHevyWorkouts, previewImport, FormatError, type WorkoutSet, type ImportPreview } from '../lib/hevy/hevy';
import { personalRecords, e1rmSeries, weeklyTonnage, groupWorkouts, isWorking, weekStart } from '../lib/hevy/training';
import { lookupExercise, alternativesFor, CORE_STABILITY, MUSCLE_RU, type Muscle } from '../lib/hevy/exercises';
import { dots } from '../lib/calc/strength';
import { overrideMap } from '../lib/derive';
import { addDays } from '../lib/calc/trend';

const LIFT_RU = { bench: 'Жим лёжа', squat: 'Присед', deadlift: 'Становая' } as const;

export function Strength() {
  const { sets, d, settings, overrides } = useStore();
  const toast = useToast();
  const [pending, setPending] = useState<{ rows: WorkoutSet[]; preview: ImportPreview; errors: string[]; unit: string; name: string } | null>(null);
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

  const doImport = async () => {
    const f = await pickFile('.csv,.tsv,.txt,text/csv,text/tab-separated-values');
    if (!f) return;
    try {
      const r = parseHevyWorkouts(await f.text());
      const keys = new Set((await getDb().sets.toCollection().primaryKeys()) as string[]);
      setPending({ rows: r.rows, preview: previewImport(r.rows, keys), errors: r.errors, unit: r.unit, name: f.name });
    } catch (e) {
      toast(e instanceof FormatError ? e.message : `Файл не прочитан: ${(e as Error).message}`);
    }
  };
  const confirm_ = async () => {
    if (!pending) return;
    const db = getDb();
    const keys = new Set((await db.sets.toCollection().primaryKeys()) as string[]);
    const seen = new Set<string>();
    const fresh = pending.rows.filter((r) => !keys.has(r.key) && !seen.has(r.key) && seen.add(r.key));
    await db.sets.bulkPut(fresh);
    setPending(null);
    toast(`Добавлено подходов: ${fresh.length}`);
  };

  const bw = d.values.weight;
  const k = d.keyLifts;
  const total = k.bench && k.squat && k.deadlift ? k.bench.value + k.squat.value + k.deadlift.value : null;
  const wk = d.weekly.all[addDays(weekStart(d.now), -7)] ?? {};
  const avg = d.weekly.avg ?? {};
  const fourWeeksAgo = addDays(d.now, -28);
  const axial = [...new Set(sets.filter((s) => s.start.slice(0, 10) >= fourWeeksAgo && isWorking(s) && lookupExercise(s.exercise, ov)?.axial).map((s) => s.exercise))];

  return (
    <div>
      <div className="spread">
        <h1>Силовые</h1>
        <button className="btn btn-primary" onClick={doImport}>
          Импорт Hevy (CSV)
        </button>
      </div>
      <details className="tiny muted" style={{ marginBottom: 10 }}>
        <summary>Как выгрузить из Hevy</summary>
        Hevy → Профиль → ⚙ Настройки → «Export & Import Data» → «Export Workouts» → сохраните CSV в «Файлы» и выберите его здесь. Повторный импорт того же или более нового файла не создаёт дублей.
      </details>

      {sets.length === 0 ? (
        <Card>
          <Empty>Тренировок пока нет. Импортируйте CSV из Hevy — посчитаем подходы на мышцу, рекорды и расчётный 1ПМ.</Empty>
        </Card>
      ) : (
        <>
          <Card title="Базовые движения" extra={<span className="tiny muted">лучший расч. 1ПМ за 120 дней</span>}>
            <div className="grid3">
              {(Object.keys(LIFT_RU) as Array<keyof typeof LIFT_RU>).map((l) => (
                <Stat key={l} label={LIFT_RU[l]} value={k[l] ? fmt(k[l]!.value, 0) : '—'} sub={k[l] && bw ? `${fmt(k[l]!.value / bw, 2)} × вес` : 'кг'} />
              ))}
            </div>
            <p className="tiny" style={{ marginTop: 8 }}>
              DOTS (сумма трёх): <b>{total && bw ? fmt(dots(total, bw, settings.sex), 1) : '—'}</b>
              {!total && <span className="muted"> — нужны все три движения</span>}
            </p>
            <p className="tiny muted">1ПМ = среднее Epley и Brzycki, только подходы до 10 повторов. Это оценка, не тест.</p>
          </Card>

          {settings.healthFlags.hyperlordosis && axial.length > 0 && (
            <Card title="⚠ Осевая нагрузка при гиперлордозе" className="banner-warn">
              <p className="tiny">За 4 недели: {axial.join(', ')}.</p>
              <ul className="list tiny">
                {axial.slice(0, 4).map((a) => (
                  <li key={a}>
                    <b>{a}</b> → альтернативы: {alternativesFor(a).join(', ')}
                  </li>
                ))}
              </ul>
              <p className="tiny">Стабилизация кора: {CORE_STABILITY.join(', ')}.</p>
              <p className="tiny muted">Это подсказка, а не диагноз. Боль ≥ 3/10 — прекратите упражнение и обратитесь к врачу.</p>
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
                        {settings.healthFlags.hyperlordosis && lookupExercise(p.exercise, ov)?.axial ? ' ⚠' : ''}
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

      <Sheet open={!!pending} onClose={() => setPending(null)} title="Превью импорта">
        {pending && (
          <div className="stack">
            <p className="tiny muted">Файл: {pending.name} · единицы: {pending.unit === 'lbs' ? 'фунты → пересчитаны в кг' : pending.unit === 'mixed' ? 'кг и фунты' : 'кг'}</p>
            <table className="tbl">
              <tbody>
                <tr>
                  <td>Тренировок в файле</td>
                  <td>{pending.preview.workouts}</td>
                </tr>
                <tr>
                  <td>Новых тренировок</td>
                  <td style={{ color: 'var(--good)' }}>{pending.preview.newWorkouts}</td>
                </tr>
                <tr>
                  <td>Уже импортированы (дубли)</td>
                  <td>{pending.preview.duplicateWorkouts}</td>
                </tr>
                <tr>
                  <td>Подходов новых / дублей</td>
                  <td>
                    {pending.preview.newSets} / {pending.preview.duplicateSets}
                  </td>
                </tr>
                <tr>
                  <td>Разминочных (не в объёме)</td>
                  <td>{pending.preview.warmupSets}</td>
                </tr>
              </tbody>
            </table>
            {pending.errors.length > 0 && (
              <details>
                <summary style={{ color: 'var(--warn)' }}>Пропущено строк: {pending.errors.length}</summary>
                <ul className="tiny">
                  {pending.errors.slice(0, 20).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
            <button className="btn btn-primary btn-block" disabled={pending.preview.newSets === 0} onClick={confirm_}>
              {pending.preview.newSets === 0 ? 'Нового нет' : `Добавить ${pending.preview.newSets} подходов`}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function ExerciseEditor({ title }: { title: string }) {
  const { overrides } = useStore();
  const toast = useToast();
  const cur = lookupExercise(title, overrideMap(overrides));
  const [primary, setPrimary] = useState<Muscle[]>(cur?.primary ?? []);
  const [secondary, setSecondary] = useState<Muscle[]>(cur?.secondary ?? []);
  const [axial, setAxial] = useState(!!cur?.axial);
  const toggle = (list: Muscle[], set: (m: Muscle[]) => void, m: Muscle) => set(list.includes(m) ? list.filter((x) => x !== m) : [...list, m]);
  const isOverride = overrides.some((o) => o.title === title);
  return (
    <div style={{ marginTop: 10 }}>
      <div className="tiny muted">Основные (1 подход)</div>
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
      <label className="row tiny">
        <input type="checkbox" checked={axial} onChange={(e) => setAxial(e.target.checked)} /> Осевая нагрузка на позвоночник
      </label>
      <div className="row" style={{ marginTop: 8 }}>
        <button
          className="btn btn-primary"
          disabled={!primary.length}
          onClick={async () => {
            await getDb().exerciseOverrides.put({ title, primary, secondary, axial });
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
