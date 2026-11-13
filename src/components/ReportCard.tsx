// Мини-отчёт «что качать» на экране «Советы».
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { buildReport, reportText } from '../lib/report';
import { Card, fmt, useToast } from './ui';
import { Tape } from './Tape';

export function ReportCard() {
  const { d, settings } = useStore();
  const toast = useToast();
  const r = useMemo(() => buildReport(d, settings), [d, settings]);
  const [shown, setShown] = useState<string | null>(null);
  const hasAny = r.zones.length || r.strength.some((x) => x.score != null) || r.body.length;

  const copy = async () => {
    const text = reportText(r);
    try {
      await navigator.clipboard.writeText(text);
      toast('Отчёт скопирован');
    } catch {
      setShown(text);
    }
  };

  return (
    <Card title="Что качать" extra={<button className="btn btn-small" onClick={copy}>Скопировать</button>}>
      {!hasAny ? (
        <p className="muted" style={{ margin: '8px 0 0' }}>Отчёт появится, когда будут замеры (вес, шея, талия, обхваты мышц, запястье и лодыжка) и импорт тренировок.</p>
      ) : (
        <div className="stack">
          <p style={{ fontWeight: 600, marginTop: 8 }}>{r.headline}</p>

          {r.zones.length > 0 && (
            <>
              <h3 className="group-title">Эстетика, по приоритету</h3>
              <div>
                {r.zones.map((z, i) => (
                  <div key={z.zone} className="pattern">
                    <Tape
                      label={`${i + 1}. ${z.label}`}
                      value={z.pct}
                      max={100}
                      caption={`${fmt(z.current, 1)} → ${fmt(z.target, 1)} см`}
                      ariaText={`${z.label}: сейчас ${fmt(z.current, 1)}, цель ${fmt(z.target, 1)} сантиметров, выполнено ${Math.round(z.pct)} процентов`}
                    />
                    <small className="muted">
                      {Math.round(z.pct)} % ({z.basis}); {z.sets}
                      {z.exercises.length > 0 && <>: {z.exercises.slice(0, 3).join(', ')}</>}
                    </small>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3 className="group-title">Сила, от слабого движения</h3>
          <table className="tbl">
            <tbody>
              {r.strength.map((p) => (
                <tr key={p.pattern}>
                  <td>{p.label}</td>
                  <td style={{ textAlign: 'left' }}>
                    {p.exercise ? (
                      <>
                        {p.exercise}, балл <b>{Math.round(p.score!)}</b>
                      </>
                    ) : (
                      <span className="muted">нет данных</span>
                    )}
                    {p.exercises.length > 0 && (p.score == null || p.score < 60) && <div className="tiny muted">Добавить: {p.exercises.slice(0, 2).join(', ')}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {r.volume.length > 0 && (
            <p className="tiny">
              <b>Объём ниже 10 подходов в неделю:</b> {r.volume.map((x) => `${x.muscle} ${fmt(x.sets, 1)}`).join(', ')}. Добавляйте по 2–4 подхода в неделю и тренируйте группу 2 раза в неделю.
            </p>
          )}

          {r.body.length > 0 && (
            <>
              <h3 className="group-title">Состав тела и питание</h3>
              <ul className="tiny" style={{ paddingLeft: 18, margin: 0 }}>
                {r.body.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </>
          )}

          {r.forecast && (
            <>
              <h3 className="group-title">Прогноз (модель)</h3>
              <table className="tbl">
                <thead>
                  <tr>
                    <th></th>
                    <th>6 мес.</th>
                    <th>12 мес.</th>
                    <th>Потолок</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Вес</td>
                    <td>{fmt(r.forecast.m6.weight, 1)}</td>
                    <td>{fmt(r.forecast.m12.weight, 1)}</td>
                    <td>{fmt(r.forecast.ceiling.weight, 1)}</td>
                  </tr>
                  <tr>
                    <td>Жир, %</td>
                    <td>{fmt(r.forecast.m6.bodyFat, 1)}</td>
                    <td>{fmt(r.forecast.m12.bodyFat, 1)}</td>
                    <td>{fmt(r.forecast.ceiling.bodyFat, 1)}</td>
                  </tr>
                  <tr>
                    <td>FFMI</td>
                    <td>{fmt(r.forecast.m6.normFfmi, 1)}</td>
                    <td>{fmt(r.forecast.m12.normFfmi, 1)}</td>
                    <td>{fmt(r.forecast.ceiling.normFfmi, 1)}</td>
                  </tr>
                  {d.values.bicepsFlexed && (
                    <tr>
                      <td>Бицепс</td>
                      <td>{fmt(r.forecast.m6.values.bicepsFlexed, 1)}</td>
                      <td>{fmt(r.forecast.m12.values.bicepsFlexed, 1)}</td>
                      <td>{fmt(r.forecast.ceiling.values.bicepsFlexed, 1)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="tiny muted">
                {r.forecast.half != null && `Половина пути к потолку ≈ ${Math.round(r.forecast.half)} мес. `}Посмотреть тело в будущем: «Сегодня», режим модели «Прогноз».
              </p>
            </>
          )}

          {r.notes.map((n) => (
            <p key={n} className="tiny muted">
              {n}
            </p>
          ))}
          {shown && <textarea readOnly value={shown} rows={10} onFocus={(e) => e.currentTarget.select()} aria-label="Текст отчёта" />}
        </div>
      )}
    </Card>
  );
}
