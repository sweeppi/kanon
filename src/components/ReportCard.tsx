// Мини-отчёт «что качать» на экране «Советы».
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { buildReport, reportText } from '../lib/report';
import { Card, Progress, fmt, useToast, Empty } from './ui';

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
    <Card title="Мини-отчёт: что качать" extra={<button className="btn btn-small" onClick={copy}>Скопировать</button>}>
      {!hasAny ? (
        <Empty>Нужны замеры (вес, шея, талия, обхваты мышц, запястье и лодыжка) и импорт тренировок.</Empty>
      ) : (
        <div className="stack">
          <p>
            <b>{r.headline}</b>
          </p>

          {r.zones.length > 0 && (
            <>
              <h3>Эстетика — по приоритету</h3>
              <ol style={{ paddingLeft: 18, margin: 0 }}>
                {r.zones.map((z) => (
                  <li key={z.zone} style={{ marginBottom: 10 }}>
                    <div className="spread">
                      <b>{z.label}</b>
                      <span className="tiny">
                        {fmt(z.current, 1)} → {fmt(z.target, 1)} см
                      </span>
                    </div>
                    <Progress value={z.pct} />
                    <div className="tiny muted" style={{ marginTop: 3 }}>
                      {Math.round(z.pct)} % ({z.basis}) · {z.sets}
                      {z.exercises.length > 0 && <> · {z.exercises.slice(0, 3).join(', ')}</>}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}

          <h3>Сила — от слабого движения</h3>
          <table className="tbl">
            <tbody>
              {r.strength.map((p) => (
                <tr key={p.pattern}>
                  <td>{p.label}</td>
                  <td style={{ textAlign: 'left' }}>
                    {p.exercise ? (
                      <>
                        {p.exercise} · <b>{Math.round(p.score!)}</b>
                      </>
                    ) : (
                      <span className="muted">нет данных</span>
                    )}
                    {p.exercises.length > 0 && (p.score == null || p.score < 60) && <div className="tiny muted">→ {p.exercises.slice(0, 2).join(', ')}</div>}
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
              <h3>Состав тела и питание</h3>
              <ul className="tiny" style={{ paddingLeft: 18, margin: 0 }}>
                {r.body.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </>
          )}

          {r.forecast && (
            <>
              <h3>Прогноз (модель)</h3>
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
                {r.forecast.half != null && `Половина пути к потолку ≈ ${Math.round(r.forecast.half)} мес. `}Посмотреть тело в будущем: Главная → 3D → «Прогноз».
              </p>
            </>
          )}

          {r.notes.map((n) => (
            <p key={n} className="tiny muted">
              {n}
            </p>
          ))}
          {shown && <textarea readOnly value={shown} rows={10} onFocus={(e) => e.currentTarget.select()} />}
        </div>
      )}
    </Card>
  );
}
