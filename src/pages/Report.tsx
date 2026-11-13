// «Отчёт для тренера»: одна страница с итогами периода. PDF делает сам браузер: «Печать» → «Сохранить в PDF».
// Имён и контактов в отчёте нет — только показатели.
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { Seg, ScreenHead, fmt, fmtDate } from '../components/ui';
import { periodStats } from '../lib/stats';
import { fmtSleep } from '../lib/daily';
import { activeFlags } from '../lib/health';
import { FIELDS } from '../lib/measureMeta';
import { STRENGTH_PATTERNS } from '../lib/hevy/training';
import { MUSCLE_RU, PATTERN_RU, type Muscle } from '../lib/hevy/exercises';

function Line({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td>{label}</td>
      <td>{value}</td>
    </tr>
  );
}

export function ReportPage() {
  const { ms, sets, foods, daily, water, d, settings: s, programs } = useStore();
  const [days, setDays] = useState<'30' | '90'>('30');
  const { cur, prev } = useMemo(() => periodStats({ ms, sets, foods, daily, water }, +days, d.now), [ms, sets, foods, daily, water, days, d.now]);
  const flags = activeFlags(s.healthFlags);
  const program = programs.find((p) => p.id === s.activeProgramId);
  const t = d.targets;
  const v = (x: number | null, digits = 0, unit = '') => (x === null ? '—' : `${fmt(x, digits)}${unit}`);
  const vs = (a: number | null, b: number | null, digits = 0, unit = '') => `${v(a, digits, unit)}${a !== null && b !== null ? ` (было ${fmt(b, digits)})` : ''}`;
  const measures = FIELDS.filter((f) => d.values[f.key] !== undefined && !['weight', 'height', 'bodyFatInput'].includes(f.key));
  const volume = (Object.keys(MUSCLE_RU) as Muscle[]).filter((m) => (d.weekly.avg?.[m] ?? 0) > 0);

  return (
    <div className="report">
      <div className="no-print">
        <ScreenHead title="Отчёт" sub="Одна страница для тренера или врача. В отчёте нет имени и контактов." />
        <div className="subnav">
          <Seg<'30' | '90'>
            value={days}
            onChange={setDays}
            label="Период"
            options={[
              ['30', '30 дней'],
              ['90', '90 дней'],
            ]}
          />
        </div>
        <button className="btn btn-primary btn-block" onClick={() => window.print()}>
          Печать или сохранить в PDF
        </button>
        <p className="caption" style={{ margin: '8px 0 16px' }}>
          На iPhone: в окне печати нажмите «Поделиться» — получится PDF, его можно сохранить в «Файлы» или отправить. Ниже — то, что попадёт на страницу.
        </p>
      </div>

      <article className="card report-sheet">
        <h2 className="display" style={{ fontSize: '1.75rem' }}>
          Отчёт о тренировках и питании
        </h2>
        <p className="caption" style={{ margin: '4px 0 0' }}>
          Период {fmtDate(cur.from)} — {fmtDate(cur.to)} ({days} дней), в скобках — предыдущие {days} дней. Сформировано в приложении «Канон» {fmtDate(d.now)}.
        </p>

        <h3 className="group-title">Профиль</h3>
        <table className="tbl">
          <tbody>
            <Line label="Пол, возраст" value={`${s.sex === 'male' ? 'мужской' : 'женский'}, ${s.age}`} />
            <Line label="Рост" value={`${fmt(d.comp.heightCm, 0)} см`} />
            <Line label="Стаж тренировок" value={`${s.trainingYears} лет`} />
            <Line label="Цель" value={`${s.goalWeightKg > 0 ? `${s.goalWeightKg} кг, ` : ''}жир ${s.goalBodyFat} %`} />
            {flags.length > 0 && <Line label="Ограничения (со слов)" value={flags.map((f) => f.label).join('; ')} />}
          </tbody>
        </table>

        <h3 className="group-title">Состав тела сейчас</h3>
        <table className="tbl">
          <tbody>
            <Line label="Вес (тренд)" value={`${fmt(d.trend.at(-1)?.value ?? d.values.weight, 1)} кг${d.ratePctPerWeek != null ? `, ${d.ratePctPerWeek > 0 ? '+' : ''}${fmt(d.ratePctPerWeek, 2)} % в неделю` : ''}`} />
            <Line label="Жир" value={d.comp.bodyFat != null ? `${fmt(d.comp.bodyFat, 1)} % (${d.comp.bodyFatSource === 'navy' ? 'формула ВМС США, ±3–4 %' : 'весы или калипер'})` : '—'} />
            <Line label="Безжировая масса, FFMI" value={`${fmt(d.comp.lbm, 1)} кг, ${fmt(d.comp.normFfmi, 1)}`} />
            <Line label="Талия / рост" value={fmt(d.comp.whtr, 2)} />
            {measures.length > 0 && <Line label="Обхваты, см" value={measures.map((f) => `${f.label.toLowerCase()} ${fmt(d.values[f.key], 1)}`).join(', ')} />}
          </tbody>
        </table>

        <h3 className="group-title">За период</h3>
        <table className="tbl">
          <tbody>
            <Line label="Средний вес" value={vs(cur.weightAvg, prev.weightAvg, 1, ' кг')} />
            <Line label="Тренировок" value={vs(cur.workouts, prev.workouts)} />
            <Line label="Рабочих подходов" value={vs(cur.workingSets, prev.workingSets)} />
            <Line label="Тоннаж" value={vs(cur.tonnage, prev.tonnage, 0, ' кг')} />
            <Line label="Калории в день" value={`${vs(cur.kcalAvg, prev.kcalAvg, 0, ' ккал')}${t ? `, цель ${fmt(t.kcal, 0)}` : ''}`} />
            <Line label="Белок в день" value={`${vs(cur.proteinAvg, prev.proteinAvg, 0, ' г')}${t ? `, цель ${fmt(t.protein, 0)}` : ''}`} />
            <Line label="Дней с записями еды" value={`${cur.foodDays} из ${days}`} />
            <Line label="Шагов в день" value={vs(cur.stepsAvg, prev.stepsAvg)} />
            <Line label="Сон за ночь" value={cur.sleepAvgMin === null ? '—' : `${fmtSleep(cur.sleepAvgMin)}, ночей записано ${cur.sleepNights}`} />
            <Line label="Вода в день" value={v(cur.waterAvgMl, 0, ' мл')} />
          </tbody>
        </table>

        {Object.keys(d.patterns).length > 0 && (
          <>
            <h3 className="group-title">Ключевые движения (лучшее за 120 дней)</h3>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Движение</th>
                  <th>Упражнение, расчётный 1ПМ</th>
                </tr>
              </thead>
              <tbody>
                {STRENGTH_PATTERNS.filter((p) => d.patterns[p]).map((p) => (
                  <Line key={p} label={PATTERN_RU[p]} value={`${d.patterns[p]!.exercise}: ${fmt(d.patterns[p]!.e1rm, 0)} кг (${fmt(d.patterns[p]!.ratio, 2)} от веса тела)`} />
                ))}
              </tbody>
            </table>
          </>
        )}

        {volume.length > 0 && (
          <>
            <h3 className="group-title">Подходов на мышцу в неделю (среднее за 2 недели)</h3>
            <p style={{ margin: 0 }}>{volume.map((m) => `${MUSCLE_RU[m].toLowerCase()} ${fmt(d.weekly.avg![m]!, 1)}`).join(', ')}</p>
          </>
        )}

        {program && (
          <>
            <h3 className="group-title">Программа: {program.name}</h3>
            {program.days.map((day) => (
              <p key={day.name} style={{ margin: '0 0 6px' }}>
                <b>{day.name}.</b> {day.exercises.map((e) => `${e.name} ${e.sets}×${e.repsMin}–${e.repsMax}`).join('; ')}
              </p>
            ))}
          </>
        )}

        <p className="caption" style={{ margin: '16px 0 0' }}>
          Расчёты приблизительные: % жира по обхватам, расчётный 1ПМ по формулам Epley и Brzycki (подходы до 10 повторов), средние питания — по дням с записями. Уровень и пропорции в приложении — эвристики. Отчёт не является медицинским документом.
        </p>
      </article>
    </div>
  );
}
