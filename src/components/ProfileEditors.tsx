// Общие редакторы профиля: активность и ограничения по здоровью (Настройки + онбординг).
import { NumField, Seg, fmt } from './ui';
import type { Settings } from '../lib/data/db';
import { activityTdee } from '../lib/calc/activity';
import { mifflin } from '../lib/calc/nutrition';
import { HEALTH_FLAGS } from '../lib/health';

export function ActivityEditor({ s, set, weightKg, stepsAvg }: { s: Settings; set: (p: Partial<Settings>) => void; weightKg?: number; /** среднее за 7 дней по записанным шагам */ stepsAvg?: number | null }) {
  const a = s.activity;
  const w = weightKg ?? 75;
  const bmr = mifflin(s.sex, w, s.heightCm, s.age);
  const calc = activityTdee(bmr, w, a);
  const upd = (p: Partial<Settings['activity']>) => set({ activity: { ...a, ...p } });
  return (
    <div className="stack">
      <Seg<Settings['activityMode']>
        value={s.activityMode}
        onChange={(m) => set({ activityMode: m })}
        label="Как считать активность"
        options={[
          ['calculator', 'По шагам и тренировкам'],
          ['manual', 'Свой коэффициент'],
        ]}
      />
      {s.activityMode === 'manual' ? (
        <NumField label="Коэффициент активности (×BMR)" min={1.1} max={2.4} value={s.activityFactor} onChange={(v) => v && set({ activityFactor: v })} hint="1,2 — сидячий; 1,375 — лёгкая; 1,55 — умеренная; 1,725 — высокая; 1,9 — очень высокая" />
      ) : (
        <>
          <div className="grid2">
            <NumField label="Шагов в день (в среднем)" min={0} max={60000} step={100} value={a.stepsPerDay} onChange={(v) => v !== undefined && upd({ stepsPerDay: v })} hint="Из «Здоровья» iPhone: среднее за неделю" />
            <NumField label="Тренировок в неделю" min={0} max={14} step={0.5} value={a.trainingsPerWeek} onChange={(v) => v !== undefined && upd({ trainingsPerWeek: v })} />
            <NumField label="Длительность тренировки" unit="мин" min={0} max={240} step={5} value={a.trainingMinutes} onChange={(v) => v !== undefined && upd({ trainingMinutes: v })} />
            <NumField label="На ногах без ходьбы" unit="ч/нед" min={0} max={80} step={1} value={a.standingHoursPerWeek} onChange={(v) => v !== undefined && upd({ standingHoursPerWeek: v })} hint="Работа стоя (официант, продавец). Ходьба уже учтена шагами" />
          </div>
          {stepsAvg != null && stepsAvg !== a.stepsPerDay && (
            <button type="button" className="btn btn-block" onClick={() => upd({ stepsPerDay: stepsAvg })}>
              Подставить {fmt(stepsAvg, 0)} шагов — среднее за 7 дней по вашим записям
            </button>
          )}
          <label className="field">
            <span className="field-label">Интенсивность тренировок</span>
            <select value={a.trainingIntensity} onChange={(e) => upd({ trainingIntensity: e.target.value as 'moderate' | 'vigorous' })}>
              <option value="moderate">Обычная силовая с отдыхом между подходами (≈ 3,5 MET)</option>
              <option value="vigorous">Интенсивная: суперсеты, короткий отдых, круговая (≈ 6 MET)</option>
            </select>
          </label>
          <div className="banner tiny">
            Итог: <b>≈ ×{fmt(calc.factor, 2)}</b> от BMR: база {fmt(calc.base, 0)} + шаги {fmt(calc.walking, 0)} + тренировки {fmt(calc.training, 0)} + работа стоя {fmt(calc.standing, 0)} = <b>{fmt(calc.tdee, 0)} ккал</b>
            {!weightKg && ' (для веса 75 кг — внесите свой вес в замерах)'}. MET по Compendium of Physical Activities. Это оценка ±10–15 %: через 2–3 недели взвешиваний и дневника приложение посчитает реальный расход (адаптивный TDEE).
          </div>
        </>
      )}
    </div>
  );
}

export function HealthEditor({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  return (
    <div className="stack">
      {HEALTH_FLAGS.map((f) => (
        <label key={f.key} className="check" style={{ alignItems: 'flex-start', fontSize: 'inherit', padding: '8px 0' }}>
          <input type="checkbox" checked={!!s.healthFlags[f.key]} onChange={(e) => set({ healthFlags: { ...s.healthFlags, [f.key]: e.target.checked } })} style={{ marginTop: 2, flex: 'none' }} />
          <span>
            {f.label}
            <span className="tiny muted" style={{ display: 'block' }}>
              {f.hint}
            </span>
          </span>
        </label>
      ))}
      <p className="tiny muted">Это подсказки по выбору упражнений, а не диагноз и не лечение. При боли, онемении, головокружении — к врачу.</p>
    </div>
  );
}
