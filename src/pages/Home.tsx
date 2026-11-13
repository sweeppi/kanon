// Экран «Сегодня». Порядок сверху вниз: скульптура и уровень → питание за день → показатели → справочные блоки (свёрнуты).
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { Card, Stat, Seg, Fold, fmt, fmtDate } from '../components/ui';
import { Icon } from '../components/icons';
import { Tape } from '../components/Tape';
import { NextWorkout } from '../components/NextWorkout';
import { LineChart } from '../components/Chart';
import { Body3DSlot } from '../components/Body3DSlot';
import { targetsFromValues } from '../lib/model/targets';
import { globalsFromComposition, type Calibration } from '../lib/model/calibrate';
import { latestValues, composition, goalMeasurements } from '../lib/derive';
import { forecastAt, type ForecastBase } from '../lib/calc/forecast';
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

type Mode = 'now' | 'forecast' | 'goal' | 'reeves' | 'ab';

export function Home() {
  const { d, settings, ms } = useStore();
  const [mode, setMode] = useState<Mode>('now');
  const [heat, setHeat] = useState(false);
  const [ghostOn, setGhostOn] = useState(false); // в «Прогнозе» и «Цели» сравнение с текущим телом — по желанию
  const dates = useMemo(() => [...new Set(ms.map((m) => m.date))].sort(), [ms]);
  const [dateA, setDateA] = useState<string>('');
  const [dateB, setDateB] = useState<string>('');
  const [months, setMonths] = useState<number>(12);
  const [ceiling, setCeiling] = useState(false);
  const [fcStyle, setFcStyle] = useState<'aesthetic' | 'max'>('aesthetic');
  const fcBase: ForecastBase | null =
    d.values.weight && d.comp.bodyFat != null
      ? {
          sex: settings.sex,
          heightCm: d.comp.heightCm,
          weight: d.values.weight,
          bodyFat: d.comp.bodyFat,
          values: d.values,
          trainingYears: settings.trainingYears,
          goalBodyFat: settings.goalBodyFat,
          cutRatePct: settings.cutRatePct,
          butt: d.comp.butt,
          style: fcStyle,
        }
      : null;
  const fc = useMemo(() => (fcBase ? forecastAt(fcBase, ceiling ? 'ceiling' : months) : null), [fcBase && JSON.stringify(fcBase), months, ceiling]); // eslint-disable-line react-hooks/exhaustive-deps
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
      // Цель = эстетический итог (FFMI ≈ 23, жир ≈ 10 %) + ручные цели из настроек; без веса/жира — старая цель по Ривзу
      if (fcBase) {
        const g = forecastAt({ ...fcBase, style: 'aesthetic' }, 'ceiling');
        const spec = specFor({ ...g.values, ...settings.goalMeasurements });
        spec.globals = { ...spec.globals, ...globalsFromComposition(g.normFfmi, g.bodyFat, settings.sex) };
        return { primary: spec, ghost: now };
      }
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
    if (mode === 'forecast' && fc) {
      const spec = specFor(fc.values);
      spec.globals = { ...spec.globals, ...globalsFromComposition(fc.normFfmi, fc.bodyFat, settings.sex) };
      return { primary: spec, ghost: now };
    }
    if (mode === 'ab') {
      const a = dateA || dates[0];
      const b = dateB || dates[dates.length - 1];
      return { primary: specFor(latestValues(ms, b).values), ghost: specFor(latestValues(ms, a).values) };
    }
    return { primary: now, ghost: null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, v, d, settings, dateA, dateB, ms, dates, fc]);

  const nextMin = LEVELS[lvl.levelIndex + 1]?.minScore ?? 100;
  const curMin = LEVELS[lvl.levelIndex].minScore;
  const maxRes = cal ? Math.max(0, ...Object.values(cal.main.residuals).map((x) => Math.abs(x ?? 0))) : null;
  const noLevelData = lvl.missing.length === applicableComponents(settings.sex).length;

  const dateLabel = new Date(`${d.now}T00:00`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const eaten = d.totals.get(d.now);
  const t = d.targets;
  const kcalLeft = t ? Math.round(t.kcal - (eaten?.kcal ?? 0)) : null;
  const ghostLegend = mode === 'reeves' ? 'Бронзовый силуэт — идеал Ривза' : mode === 'ab' ? 'Бронзовый силуэт — дата A' : null;

  return (
    <div>
      <header className="screen-head">
        <div>
          <h1 className="display">Сегодня</h1>
          <p>{dateLabel}</p>
        </div>
        {d.streak > 0 && (
          <span className="chip" title="Дней подряд с любой записью">
            <Icon name="flame" size={16} />
            {d.streak} дн. подряд
          </span>
        )}
      </header>

      <section className="statue" aria-label="3D-модель тела и уровень">
        {!hasBody ? (
          <div className="body-poster">
            <p>Здесь появится 3D-модель вашего тела — она подстроится под обхваты.</p>
            <a className="btn btn-primary" href="#measure">
              Внести замеры
            </a>
          </div>
        ) : (
          <>
            {!noLevelData && (
              <div className="statue-level">
                <b>{lvl.level}</b>
                <small className="muted">уровень, {fmt(lvl.score, 0)} из 100</small>
              </div>
            )}
            <span className="statue-note">модель приблизительная</span>
            <Body3DSlot height={400} primary={primary} ghost={mode === 'forecast' || mode === 'goal' ? (ghostOn ? ghost : null) : ghost} heat={heat} zoneStatus={d.zoneStatus} onCalibrated={(main, g) => setCal({ main, ghost: g })} />
            <Seg<Mode>
              value={mode}
              onChange={setMode}
              label="Режим модели"
              options={[
                ['now', 'Сейчас'],
                ['forecast', 'Прогноз'],
                ['goal', 'Цель'],
                ...(male ? ([['reeves', 'Ривз']] as Array<[Mode, string]>) : []),
                ['ab', 'A / B'],
              ]}
            />
            <div className="spread" style={{ flexWrap: 'wrap' }}>
              <label className="check">
                <input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} /> Сильные и слабые зоны
              </label>
              {(mode === 'goal' || mode === 'forecast') && (
                <label className="check">
                  <input type="checkbox" checked={ghostOn} onChange={(e) => setGhostOn(e.target.checked)} /> Показать «сейчас»
                </label>
              )}
              {ghostLegend && <span className="tiny muted">{ghostLegend}</span>}
            </div>
            {heat && (
              <p className="tiny muted">
                <span style={{ color: 'var(--good)' }}>■</span> сильная зона, <span style={{ color: 'var(--warn)' }}>■</span> средняя, <span style={{ color: 'var(--bad)' }}>■</span> отстающая, серый — нет данных. Оценка по пропорциям Ривза, плечам/талии и недельному объёму.
              </p>
            )}
          </>
        )}
      </section>

      {hasBody && mode === 'ab' && (
        <Card>
          <div className="grid2">
            <label className="field">
              <span className="field-label">Дата A (силуэт)</span>
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
        </Card>
      )}

      {hasBody && mode === 'forecast' && (
        <Card title="Прогноз">
          {!fc ? (
            <p className="muted" style={{ marginTop: 8 }}>
              Для прогноза нужны вес и % жира (шея + талия или весы).
            </p>
          ) : (
            <div className="stack" style={{ marginTop: 12 }}>
              <Seg<'aesthetic' | 'max'>
                value={fcStyle}
                onChange={setFcStyle}
                label="Стиль цели"
                options={[
                  ['aesthetic', 'Эстетика'],
                  ['max', 'Максимум массы'],
                ]}
              />
              <p className="tiny muted">
                {fcStyle === 'aesthetic'
                  ? 'Сухое атлетичное тело: FFMI ≈ 23, жир ≈ 10 %, широкие плечи и узкая талия, ноги пропорциональные.'
                  : 'Максимум мышц у натурального потолка (культуристский тип): FFMI ≈ 25 / потенциал Casey Butt.'}
              </p>
              <div className="spread">
                <span>{ceiling ? (fcStyle === 'aesthetic' ? 'Итог: эстетическая цель' : 'Итог: натуральный потолок') : `Через ${months} мес.`}</span>
                <button className={`btn btn-small ${ceiling ? 'btn-primary' : ''}`} aria-pressed={ceiling} onClick={() => setCeiling(!ceiling)}>
                  Итог
                </button>
              </div>
              <input type="range" min={0} max={60} step={3} value={months} disabled={ceiling} onChange={(e) => setMonths(+e.target.value)} aria-label="Месяцев вперёд" style={{ width: '100%' }} />
              <table className="tbl">
                <thead>
                  <tr>
                    <th></th>
                    <th>Сейчас</th>
                    <th>{ceiling ? 'Итог' : `+${months} мес.`}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Вес, кг</td>
                    <td>{fmt(d.values.weight, 1)}</td>
                    <td>{fmt(fc.weight, 1)}</td>
                  </tr>
                  <tr>
                    <td>Жир, %</td>
                    <td>{fmt(d.comp.bodyFat, 1)}</td>
                    <td>{fmt(fc.bodyFat, 1)}</td>
                  </tr>
                  <tr>
                    <td>FFMI</td>
                    <td>{fmt(d.comp.normFfmi, 1)}</td>
                    <td>{fmt(fc.normFfmi, 1)}</td>
                  </tr>
                  {(['shoulders', 'chest', 'bicepsFlexed', 'waist', 'thigh'] as const).map((k) =>
                    d.values[k] ? (
                      <tr key={k}>
                        <td>{{ shoulders: 'Плечи', chest: 'Грудь', bicepsFlexed: 'Бицепс напр.', waist: 'Талия', thigh: 'Бедро' }[k]}</td>
                        <td>{fmt(d.values[k], 1)}</td>
                        <td>{fmt(fc.values[k], 1)}</td>
                      </tr>
                    ) : null,
                  )}
                </tbody>
              </table>
              <p className="tiny muted">
                Модель: сухая масса растёт ≈ {fmt(fcBase!.trainingYears >= 4 ? 1.75 : fcBase!.trainingYears >= 1.5 ? 3.75 : 7, 1)} кг/год{settings.sex === 'female' ? ' ÷ 2' : ''} с замедлением у {fcStyle === 'aesthetic' ? `цели FFMI ${settings.sex === 'male' ? 23 : 19.5}` : d.comp.butt ? 'потолка Casey Butt' : `потолка FFMI ${settings.sex === 'male' ? 25 : 21}`}, жир — к {fmt(fc.bodyFat, 0)} % темпом сушки. Пройдено {fmt(fc.toCeiling * 100, 0)} % пути к {fcStyle === 'aesthetic' ? 'цели' : 'потолку'}. Эвристика, а не обещание.
              </p>
            </div>
          )}
        </Card>
      )}

      {noLevelData ? (
        <Card title="Уровень">
          <p className="muted" style={{ marginTop: 8 }}>
            Уровень посчитается, когда появятся замеры и тренировки.
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <a className="btn btn-primary" href="#measure">
              Внести замеры
            </a>
            <a className="btn" href="#strength">
              Импортировать тренировки
            </a>
          </div>
        </Card>
      ) : (
        <Card>
          {lvl.next ? (
            <Tape
              label={`До уровня «${lvl.next}»`}
              value={lvl.score - curMin}
              max={nextMin - curMin}
              caption={`${fmt(lvl.score, 0)} из ${nextMin}`}
              ariaText={`Балл ${fmt(lvl.score, 0)}, для уровня «${lvl.next}» нужно ${nextMin}`}
            />
          ) : (
            <Tape label="Высший уровень" value={lvl.score} max={100} caption={`${fmt(lvl.score, 0)} из 100`} ariaText={`Балл ${fmt(lvl.score, 0)} из 100`} />
          )}
          {lvl.next && lvl.score >= nextMin && (
            <p className="tiny" style={{ color: 'var(--warn)', marginTop: 8 }}>
              Балла хватает, но не выполнены обязательные условия уровня — они в блоке «Что нужно» ниже.
            </p>
          )}
          {lvl.weakest && (
            <p className="tiny muted" style={{ margin: '12px 0 0' }}>
              Сильнее всего тянет вниз: <span style={{ color: 'var(--text)' }}>{COMP_RU[lvl.weakest]}</span>, {fmt(lvl.components[lvl.weakest], 0)} из 100
            </p>
          )}
        </Card>
      )}

      <NextWorkout compact />

      <a className="card" href={t ? '#food' : '#measure'}>
        <div className="card-head">
          <h2>Питание</h2>
          <span className="card-link">
            {t ? 'Дневник' : 'К замерам'}
            <Icon name="chevron" size={16} />
          </span>
        </div>
        {t && kcalLeft !== null ? (
          <>
            <div className="figure">
              <b>{fmt(Math.abs(kcalLeft), 0)}</b>
              <span>{kcalLeft >= 0 ? 'ккал осталось на сегодня' : 'ккал сверх цели'}</span>
            </div>
            <Tape
              label="Калории"
              value={eaten?.kcal ?? 0}
              max={t.kcal}
              caption={`${fmt(eaten?.kcal ?? 0, 0)} из ${fmt(t.kcal, 0)}`}
              ariaText={`Калории: ${fmt(eaten?.kcal ?? 0, 0)} из ${fmt(t.kcal, 0)}`}
            />
            <Tape
              label="Белок"
              value={eaten?.protein ?? 0}
              max={t.protein}
              caption={`${fmt(eaten?.protein ?? 0, 0)} из ${fmt(t.protein, 0)} г`}
              ariaText={`Белок: ${fmt(eaten?.protein ?? 0, 0)} из ${fmt(t.protein, 0)} граммов`}
            />
          </>
        ) : (
          <p className="muted" style={{ margin: '8px 0 0' }}>
            Внесите вес — посчитаем цель по калориям и белку.
          </p>
        )}
      </a>

      <Card
        title="Показатели"
        extra={
          <a className="card-link" href="#measure" style={{ minHeight: 44, textDecoration: 'none' }}>
            Новый замер
            <Icon name="chevron" size={16} />
          </a>
        }
      >
        <div className="grid2">
          <Stat label="Вес, тренд" value={fmt(d.trend.at(-1)?.value, 1)} sub={d.ratePctPerWeek != null ? `${d.ratePctPerWeek > 0 ? '+' : ''}${fmt(d.ratePctPerWeek, 2)} % в неделю` : 'кг'} />
          <Stat label="Жир, %" value={fmt(d.comp.bodyFat, 1)} sub={d.comp.bodyFatSource === 'navy' ? 'формула ВМС США' : d.comp.bodyFatSource === 'input' ? 'весы или калипер' : 'нужны шея и талия'} />
          <Stat label="FFMI" value={fmt(d.comp.normFfmi, 1)} sub="потолок ≈ 25" tone={d.comp.normFfmi && d.comp.normFfmi > 25 ? 'warn' : undefined} />
          <Stat label="Плечи / талия" value={fmt(d.comp.sw, 2)} sub={`ориентир ${GOLDEN}`} />
          <Stat label="Талия / рост" value={fmt(d.comp.whtr, 2)} sub="норма меньше 0,5" tone={d.comp.whtr ? (d.comp.whtr < 0.5 ? 'good' : 'bad') : undefined} />
          <Stat label="Без жира, кг" value={fmt(d.comp.lbm, 1)} sub="сухая масса" />
        </div>
        {d.forecast?.date && (
          <p className="tiny muted" style={{ margin: '12px 0 0' }}>
            {settings.goalWeightKg} кг — к <span style={{ color: 'var(--text)' }}>{fmtDate(d.forecast.date)}</span> при темпе {fmt(d.forecast.kgPerWeek, 2)} кг в неделю.
          </p>
        )}
      </Card>

      {d.weights.length >= 2 && (
        <Card title="Вес">
          <div style={{ marginTop: 8 }}>
            <LineChart
              unit="кг"
              target={settings.goalWeightKg}
              series={[
                { label: 'Тренд (EMA, τ = 7 дн.)', points: d.trend, color: 'var(--accent)' },
                { label: 'Взвешивания', points: d.weights, color: 'var(--muted)', dashed: true, dots: true },
              ]}
            />
          </div>
        </Card>
      )}

      <div className="section-gap">
        {lvl.next && lvl.requirements.length > 0 && (
          <Fold title={`Что нужно для «${lvl.next}»`}>
            <ul className="reqs">
              {lvl.requirements.map((r, i) => (
                <li key={i}>
                  {r.text}
                  {r.eta && <small className="muted">Срок: {r.eta}</small>}
                </li>
              ))}
            </ul>
          </Fold>
        )}

        {!noLevelData && (
          <Fold title="Из чего складывается балл">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Компонент</th>
                  <th>Вес</th>
                  <th>Балл</th>
                </tr>
              </thead>
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
            {lvl.missing.length > 0 && <p className="tiny muted">Нет данных: {lvl.missing.map((m) => COMP_RU[m]).join(', ')} — балл посчитан по остальным.</p>}
            <p className="tiny muted">Веса и пороги — эвристика приложения (см. README). Сроки — грубая оценка с высокой неопределённостью.</p>
          </Fold>
        )}

        <Fold title="Сильные и отстающие зоны">
          {d.comp.reevesStatus.length === 0 ? (
            <p className="muted">
              {male
                ? 'Нужны «костные» замеры: запястье, лодыжка, колено, таз — и обхваты мышц.'
                : 'Пропорции Ривза — мужская эвристика 1950-х, для женщин не используются. Смотрите зоны на 3D-модели и объём по мышцам.'}
            </p>
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
          <p className="tiny muted" style={{ marginTop: 8 }}>
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
        </Fold>

        <Fold title="Неделя к неделе">
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
        </Fold>

        {hasBody && cal && (
          <Fold title="Насколько точна модель">
            <p className="tiny muted">
              Подгонка обхватов: максимальное отклонение {fmt(maxRes, 1)} см
              {cal.main.outOfTolerance.length > 0 && <>; вне допуска ±2 см: {cal.main.outOfTolerance.map((k) => SLICE_RU[k]).join(', ')}</>}
              {cal.main.extrapolated.length > 0 && <>; за пределами диапазона MakeHuman: {cal.main.extrapolated.map((k) => SLICE_RU[k] ?? k).join(', ')}</>}. Модель — базовый меш MakeHuman с морфами, а не скан: форма приблизительная.
            </p>
          </Fold>
        )}
      </div>
    </div>
  );
}
