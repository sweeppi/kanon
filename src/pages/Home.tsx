import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { Card, Stat, Seg, fmt, fmtDate, Progress, Empty } from '../components/ui';
import { LineChart } from '../components/Chart';
import { Body3DSlot } from '../components/Body3DSlot';
import { targetsFromValues } from '../lib/model/targets';
import { globalsFromComposition, type Calibration } from '../lib/model/calibrate';
import { latestValues, composition, goalMeasurements } from '../lib/derive';
import { LEVELS_BY_SEX, COMPONENT_WEIGHTS, type Component } from '../lib/calc/levels.config';
import { applicableComponents } from '../lib/calc/levels';
import { GOLDEN } from '../lib/calc/body';
import type { MeasureField } from '../lib/data/db';

const COMP_RU: Record<Component, string> = {
  ffmi: 'Мышечная масса (FFMI)',
  bodyFat: '% жира',
  shoulderWaist: 'Плечи/талия',
  reeves: 'Пропорции Ривза',
  strength: 'Относительная сила',
};
const PART_RU: Record<string, string> = { bicepsFlexed: 'Бицепс (напр.)', calf: 'Голень', neck: 'Шея', chest: 'Грудь', waist: 'Талия', thigh: 'Бедро' };
const SLICE_RU: Record<string, string> = {
  height: 'рост', neck: 'шея', shoulders: 'плечи', chest: 'грудь', waist: 'талия', hips: 'таз', biceps: 'бицепс', forearm: 'предплечье',
  wrist: 'запястье', thigh: 'бедро', knee: 'колено', calf: 'голень', ankle: 'лодыжка',
};

type Mode = 'now' | 'goal' | 'reeves' | 'ab';

export function Home() {
  const { d, settings, ms } = useStore();
  const [mode, setMode] = useState<Mode>('now');
  const [heat, setHeat] = useState(false);
  const dates = useMemo(() => [...new Set(ms.map((m) => m.date))].sort(), [ms]);
  const [dateA, setDateA] = useState<string>('');
  const [dateB, setDateB] = useState<string>('');
  const [cal, setCal] = useState<{ main: Calibration; ghost: Calibration | null } | null>(null);
  const lvl = d.level;
  const LEVELS = LEVELS_BY_SEX[settings.sex];
  const male = settings.sex === 'male';
  const v = d.values;
  const hasBody = Object.keys(v).length > 0;

  const specFor = (vals: Partial<Record<MeasureField, number>>) => {
    const c = composition(vals, settings);
    return { targets: targetsFromValues(vals, c.heightCm), globals: globalsFromComposition(c.normFfmi, c.bodyFat, settings.sex) };
  };
  const { primary, ghost } = useMemo(() => {
    const now = specFor(v);
    if (mode === 'goal') {
      const g = goalMeasurements(d, settings);
      const spec = specFor(g);
      spec.globals = { ...spec.globals, ...globalsFromComposition(d.comp.normFfmi, settings.goalBodyFat, settings.sex) };
      return { primary: spec, ghost: now };
    }
    if (mode === 'reeves') {
      const r = d.comp.reevesIdeal;
      const ideal = { ...v, ...(r.bicepsFlexed ? { bicepsFlexed: r.bicepsFlexed, bicepsRelaxed: r.bicepsFlexed * 0.92 } : {}), calf: r.calf ?? v.calf, neck: r.neck ?? v.neck, chest: r.chest ?? v.chest, waist: r.waist ?? v.waist, thigh: r.thigh ?? v.thigh };
      return { primary: now, ghost: specFor(ideal) };
    }
    if (mode === 'ab') {
      const a = dateA || dates[0];
      const b = dateB || dates[dates.length - 1];
      return { primary: specFor(latestValues(ms, b).values), ghost: specFor(latestValues(ms, a).values) };
    }
    return { primary: now, ghost: null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, v, d, settings, dateA, dateB, ms, dates]);

  const nextMin = LEVELS[lvl.levelIndex + 1]?.minScore ?? 100;
  const curMin = LEVELS[lvl.levelIndex].minScore;
  const progress = ((lvl.score - curMin) / (nextMin - curMin || 1)) * 100;
  const maxRes = cal ? Math.max(0, ...Object.values(cal.main.residuals).map((x) => Math.abs(x ?? 0))) : null;

  return (
    <div>
      <Card
        title={
          <>
            Уровень: <span style={{ color: 'var(--accent)' }}>{lvl.level}</span>
          </>
        }
        extra={<span className="badge">{fmt(lvl.score, 0)} / 100</span>}
      >
        <p className="muted tiny">{LEVELS[lvl.levelIndex].blurb}</p>
        {lvl.next && (
          <>
            <div className="spread tiny" style={{ marginBottom: 4 }}>
              <span>до «{lvl.next}»</span>
              <span>
                {fmt(lvl.score, 0)} → {nextMin}
              </span>
            </div>
            <Progress value={progress} />
            <h3 style={{ marginTop: 12 }}>Что нужно для «{lvl.next}»</h3>
            <ul className="list">
              {lvl.requirements.map((r, i) => (
                <li key={i}>
                  {r.text}
                  {r.eta && <div className="tiny muted">Срок: {r.eta}</div>}
                </li>
              ))}
            </ul>
          </>
        )}
        {lvl.weakest && (
          <p className="tiny" style={{ marginTop: 8 }}>
            Сильнее всего тянет балл вниз: <b>{COMP_RU[lvl.weakest]}</b> ({fmt(lvl.components[lvl.weakest], 0)} / 100, вес {Math.round(COMPONENT_WEIGHTS[lvl.weakest] * 100)} %)
          </p>
        )}
        {lvl.missing.length === applicableComponents(settings.sex).length ? (
          <p className="tiny muted">
            Данных пока нет. <a href="#measure">Внесите замеры</a> и <a href="#strength">импортируйте тренировки</a> — уровень посчитается.
          </p>
        ) : (
          lvl.missing.length > 0 && <p className="tiny muted">Нет данных: {lvl.missing.map((m) => COMP_RU[m]).join(', ')} — балл посчитан по остальным.</p>
        )}
        <details>
          <summary>Компоненты балла</summary>
          <table className="tbl">
            <tbody>
              {applicableComponents(settings.sex).map((k: Component) => (
                <tr key={k}>
                  <td>{COMP_RU[k]}</td>
                  <td>{Math.round(COMPONENT_WEIGHTS[k] * 100)} %</td>
                  <td>{lvl.components[k] !== undefined ? fmt(lvl.components[k], 0) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="tiny muted">Веса и пороги — эвристика приложения (см. README). Сроки — грубая оценка с высокой неопределённостью.</p>
        </details>
      </Card>

      <Card title="3D-модель" extra={<span className="badge badge-warn">приблизительно</span>}>
        {!hasBody ? (
          <Empty>
            Введите замеры — модель подстроится под ваши обхваты. <a href="#measure">К замерам →</a>
          </Empty>
        ) : (
          <>
            <Seg<Mode>
              value={mode}
              onChange={setMode}
              label="Режим модели"
              options={[
                ['now', 'Сейчас'],
                ['goal', 'Цель'],
                ...(male ? ([['reeves', 'Ривз']] as Array<[Mode, string]>) : []),
                ['ab', 'A / B'],
              ]}
            />
            {mode === 'ab' && (
              <div className="grid2" style={{ marginTop: 8 }}>
                <label className="field">
                  <span className="field-label">Дата A (призрак)</span>
                  <select value={dateA || dates[0]} onChange={(e) => setDateA(e.target.value)}>
                    {dates.map((x) => (
                      <option key={x} value={x}>
                        {fmtDate(x)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Дата B</span>
                  <select value={dateB || dates[dates.length - 1]} onChange={(e) => setDateB(e.target.value)}>
                    {dates.map((x) => (
                      <option key={x} value={x}>
                        {fmtDate(x)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <Body3DSlot primary={primary} ghost={ghost} heat={heat} zoneStatus={d.zoneStatus} onCalibrated={(main, g) => setCal({ main, ghost: g })} />
            </div>
            <div className="spread" style={{ marginTop: 8 }}>
              <label className="row tiny">
                <input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} /> Тепловая карта зон
              </label>
              <span className="tiny muted">
                {mode === 'goal' && 'бронза — сейчас'}
                {mode === 'reeves' && 'бронза — идеал Ривза'}
                {mode === 'ab' && 'бронза — дата A'}
              </span>
            </div>
            {heat && (
              <p className="tiny muted">
                <span style={{ color: 'var(--good)' }}>■</span> сильная зона · <span style={{ color: 'var(--warn)' }}>■</span> средняя · <span style={{ color: 'var(--bad)' }}>■</span> отстающая · серый — нет данных. Оценка по пропорциям Ривза, плечам/талии и недельному объёму.
              </p>
            )}
            {cal && (
              <p className="tiny muted">
                Подгонка обхватов модели: макс. отклонение {fmt(maxRes, 1)} см
                {cal.main.outOfTolerance.length > 0 && <> · вне допуска ±2 см: {cal.main.outOfTolerance.map((k) => SLICE_RU[k]).join(', ')}</>}
                {cal.main.extrapolated.length > 0 && <> · за пределами диапазона MakeHuman: {cal.main.extrapolated.join(', ')}</>}. Модель — базовый меш MakeHuman с морфами, а не скан: форма приблизительная.
              </p>
            )}
          </>
        )}
      </Card>

      <Card title="Ключевые показатели" extra={<a className="tiny" href="#measure">+ замер</a>}>
        <div className="grid3">
          <Stat label="Вес (тренд)" value={fmt(d.trend.at(-1)?.value, 1)} sub={d.ratePctPerWeek != null ? `${d.ratePctPerWeek > 0 ? '+' : ''}${fmt(d.ratePctPerWeek, 2)} %/нед` : 'кг'} />
          <Stat label="% жира" value={fmt(d.comp.bodyFat, 1)} sub={d.comp.bodyFatSource === 'navy' ? 'формула ВМС США' : d.comp.bodyFatSource === 'input' ? 'весы/калипер' : 'нужны шея и талия'} />
          <Stat label="FFMI (норм.)" value={fmt(d.comp.normFfmi, 1)} sub="потолок ≈ 25" tone={d.comp.normFfmi && d.comp.normFfmi > 25 ? 'warn' : undefined} />
          <Stat label="Талия/рост" value={fmt(d.comp.whtr, 2)} sub="норма < 0,5" tone={d.comp.whtr ? (d.comp.whtr < 0.5 ? 'good' : 'bad') : undefined} />
          <Stat label="Плечи/талия" value={fmt(d.comp.sw, 2)} sub={`ориентир ${GOLDEN}`} />
          <Stat label="Безжир. масса" value={fmt(d.comp.lbm, 1)} sub="кг" />
        </div>
        {d.forecast?.date && (
          <p className="tiny" style={{ marginTop: 8 }}>
            Прогноз: {settings.goalWeightKg} кг к <b>{fmtDate(d.forecast.date)}</b> при текущем темпе {fmt(d.forecast.kgPerWeek, 2)} кг/нед.
          </p>
        )}
      </Card>

      {d.weights.length >= 2 && (
        <Card title="Вес и тренд">
          <LineChart
            unit="кг"
            target={settings.goalWeightKg}
            series={[
              { label: 'Тренд (EMA, τ = 7 дн.)', points: d.trend, color: 'var(--accent)' },
              { label: 'Взвешивания', points: d.weights, color: 'var(--muted)', dashed: true, dots: true },
            ]}
          />
        </Card>
      )}

      <Card title="Сильные и отстающие зоны" extra={<span className="badge">эвристика Ривза</span>}>
        {d.comp.reevesStatus.length === 0 ? (
          <Empty>
            {male
              ? 'Нужны «костные» замеры: запястье, лодыжка, колено, таз — и обхваты мышц.'
              : 'Пропорции Ривза — мужская эвристика 1950-х, для женщин не используются. Смотрите тепловую карту на 3D-модели и объём по мышцам.'}
          </Empty>
        ) : (
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Зона</th>
                  <th>Сейчас</th>
                  <th>Ривз</th>
                  <th>%</th>
                  <th>Разница</th>
                </tr>
              </thead>
              <tbody>
                {d.comp.reevesStatus.map((p) => (
                  <tr key={p.key}>
                    <td>{PART_RU[p.key] ?? p.key}</td>
                    <td>{fmt(p.current, 1)}</td>
                    <td>{fmt(p.target, 1)}</td>
                    <td style={{ color: p.pct >= 95 ? 'var(--good)' : p.pct >= 88 ? 'var(--warn)' : 'var(--bad)' }}>{fmt(p.pct, 0)}</td>
                    <td>{p.key === 'waist' ? (p.gapCm > 0 ? `−${fmt(p.gapCm, 1)}` : 'ок') : p.gapCm > 0 ? `+${fmt(p.gapCm, 1)}` : 'ок'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="tiny muted" style={{ marginTop: 6 }}>
          Ривз (1995): бицепс = 252 % запястья, голень = 192 % лодыжки, шея ≈ бицепс ≈ голень, грудь = 148 % таза, талия = 86 % таза, бедро = 175 % колена. Это эстетический ориентир, а не исследование.
        </p>
        {d.comp.butt && (
          <details>
            <summary>Натуральный потенциал по Casey Butt (эвристика)</summary>
            <table className="tbl">
              <tbody>
                <tr>
                  <td>Макс. безжировая масса</td>
                  <td>{fmt(d.comp.butt.maxLbmKg, 1)} кг</td>
                </tr>
                <tr>
                  <td>Вес при 10 % жира</td>
                  <td>{fmt(d.comp.butt.maxWeightKg, 1)} кг</td>
                </tr>
                {(
                  [
                    ['Шея', 'neck', 'neck'],
                    ['Грудь', 'chest', 'chest'],
                    ['Бицепс (напр.)', 'bicepsFlexed', 'bicepsFlexed'],
                    ['Предплечье', 'forearm', 'forearm'],
                    ['Бедро', 'thigh', 'thigh'],
                    ['Голень', 'calf', 'calf'],
                  ] as const
                ).map(([l, k, vk]) => (
                  <tr key={k}>
                    <td>{l}</td>
                    <td>
                      {fmt(d.comp.butt![k], 1)} см {v[vk] ? <span className="muted">({fmt((v[vk]! / d.comp.butt![k]) * 100, 0)} %)</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="tiny muted">Butt C., «Your Muscular Potential», 4-е изд. Коэффициенты взяты из калькулятора, ссылающегося на книгу; сама книга не сверена. Данные в основе модели могли включать атлетов на стероидах.</p>
          </details>
        )}
      </Card>

      <Card title="Неделя к неделе">
        <table className="tbl">
          <thead>
            <tr>
              <th>Показатель</th>
              <th>Прошлая</th>
              <th>Эта</th>
            </tr>
          </thead>
          <tbody>
            {d.weekCompare.map((r) => {
              const diff = r.thisWeek != null && r.lastWeek != null ? r.thisWeek - r.lastWeek : null;
              const good = diff == null || r.betterWhen === 'none' ? undefined : (r.betterWhen === 'up' ? diff > 0 : diff < 0) ? 'var(--good)' : 'var(--bad)';
              return (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td>{fmt(r.lastWeek, r.unit === 'кг' && r.label.includes('вес') ? 1 : 0)}</td>
                  <td style={{ color: good }}>{fmt(r.thisWeek, r.unit === 'кг' && r.label.includes('вес') ? 1 : 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
