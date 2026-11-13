// Программа тренировок: мастер-генератор по правилам и текущая программа с заменой упражнений.
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { getDb, saveSettings } from '../lib/data/db';
import { Card, Seg, Fold, ScreenHead, IconButton, Sheet, fmtDate, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { Bars } from '../components/Chart';
import { alternatives, dayMinutes, generateProgram, weeklyVolume, MAJOR, PROGRAM_SOURCES, VOLUME_MAX, VOLUME_MIN } from '../lib/program/generate';
import { beginWorkout, deleteProgram, saveProgram } from '../lib/program/actions';
import { fmtClock } from '../lib/program/session';
import { MUSCLE_RU, type Muscle } from '../lib/hevy/exercises';
import { activeFlags } from '../lib/health';
import { knowledge, pubmedUrl, doiUrl } from '../lib/advice/engine';
import { PROGRAM_CLAIMS } from '../lib/academy';
import type { Gear, Goal, PlanDay, Program } from '../lib/program/types';

const PRIORITY: Muscle[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes'];
const SOURCE_NOTE = PROGRAM_CLAIMS;

function Volume({ days }: { days: PlanDay[] }) {
  const v = weeklyVolume(days);
  return (
    <>
      <Bars band={[VOLUME_MIN, VOLUME_MAX]} max={26} data={MAJOR.concat(['biceps', 'triceps']).map((m) => ({ label: MUSCLE_RU[m], value: v[m] ?? 0 }))} />
      <p className="caption" style={{ margin: '12px 0 0' }}>
        Подходов в неделю. Зелёный — {VOLUME_MIN}–{VOLUME_MAX}. Основная мышца = 1 подход, вспомогательная = 0,5 (условность приложения).
      </p>
    </>
  );
}

function Sources() {
  const src = knowledge.sources as unknown as Record<string, { pmid: string; doi: string; authors: string; year: number; title: string; journal: string }>;
  return (
    <Fold title="На чём основана программа">
      {PROGRAM_SOURCES.map((k) => {
        const s = src[k];
        return (
          <div key={k} style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 4px' }}>{SOURCE_NOTE[k]}</p>
            <p className="caption" style={{ margin: 0 }}>
              {s.authors} ({s.year}). {s.title}. <i>{s.journal}</i>.{' '}
              <a href={pubmedUrl(s.pmid)} target="_blank" rel="noreferrer">
                PMID {s.pmid}
              </a>
              ,{' '}
              <a href={doiUrl(s.doi)} target="_blank" rel="noreferrer">
                DOI
              </a>
            </p>
          </div>
        );
      })}
      <p className="caption" style={{ margin: 0 }}>
        Эвристики приложения, а не исследования: раскладка по дням, выбор конкретных упражнений, верхняя граница {VOLUME_MAX} подходов, число подходов по стажу и оценка длительности.
      </p>
    </Fold>
  );
}

function DayCard({ day, badge, onStart, onSwap }: { day: PlanDay; badge?: string; onStart?: () => void; onSwap?: (index: number) => void }) {
  return (
    <Card title={day.name} extra={<span className="caption">{badge ? `${badge}, ` : ''}≈ {dayMinutes(day)} мин</span>}>
      <ul className="entries" style={{ marginTop: 4 }}>
        {day.exercises.map((e, i) => (
          <li key={e.name} className="entry">
            <div className="entry-main">
              <b>{e.name}</b>
              <small className="muted">
                {e.sets} × {e.repsMin}–{e.repsMax}, отдых {fmtClock(e.restSec)}
              </small>
            </div>
            {onSwap && <IconButton icon="edit" label={`Заменить упражнение ${e.name}`} onClick={() => onSwap(i)} />}
          </li>
        ))}
      </ul>
      {onStart && (
        <div className="actions" style={{ marginTop: 8 }}>
          <button className={`btn${badge ? ' btn-primary' : ''}`} onClick={onStart}>
            Начать этот день
          </button>
        </div>
      )}
    </Card>
  );
}

export function ProgramPage() {
  const { programs, settings, sets, active } = useStore();
  const toast = useToast();
  const current = programs.find((p) => p.id === settings.activeProgramId) ?? null;
  const [wizard, setWizard] = useState(false);
  const [days, setDays] = useState('4');
  const [gear, setGear] = useState<Gear>('gym');
  const [goal, setGoal] = useState<Goal>('muscle');
  const [minutes, setMinutes] = useState('75');
  const [priority, setPriority] = useState<Muscle[]>([]);
  const [draft, setDraft] = useState<Program | null>(null);
  const [swap, setSwap] = useState<{ day: number; index: number } | null>(null);
  const flags = activeFlags(settings.healthFlags);
  const showWizard = wizard || !current;

  const build = () => {
    setDraft(generateProgram({ daysPerWeek: +days, gear, goal, minutes: +minutes, trainingYears: settings.trainingYears, healthFlags: settings.healthFlags, priority }));
  };
  const start = async (p: Program, dayIndex: number) => {
    if (active && !confirm('Уже идёт другая тренировка. Начать новую и потерять её отметки?')) return;
    await beginWorkout(sets, p, dayIndex);
    location.hash = 'workout';
  };
  const swapOptions = useMemo(() => {
    if (!swap || !current) return [];
    const params = current.params ?? { gear: 'gym' as Gear, healthFlags: settings.healthFlags };
    const inDay = new Set(current.days[swap.day].exercises.map((e) => e.name));
    return alternatives(current.days[swap.day].exercises[swap.index].name, params).filter((n) => !inDay.has(n));
  }, [swap, current, settings.healthFlags]);

  if (showWizard) {
    return (
      <div>
        <ScreenHead title="Новая программа" sub="Собирается по правилам с опорой на исследования. Упражнения и раскладка — свои, без чужих шаблонов." />
        <Card>
          <h2 className="group-title" style={{ marginTop: 0 }}>
            Дней в неделю
          </h2>
          <Seg value={days} onChange={setDays} label="Дней в неделю" options={['2', '3', '4', '5', '6'].map((d) => [d, d])} />
          <h2 className="group-title">Оборудование</h2>
          <Seg<Gear>
            value={gear}
            onChange={setGear}
            label="Оборудование"
            options={[
              ['gym', 'Зал'],
              ['dumbbells', 'Гантели'],
              ['bodyweight', 'Свой вес'],
            ]}
          />
          <h2 className="group-title">Цель</h2>
          <Seg<Goal>
            value={goal}
            onChange={setGoal}
            label="Цель"
            options={[
              ['muscle', 'Мышцы'],
              ['strength', 'Сила'],
            ]}
          />
          <h2 className="group-title">Время на тренировку, мин</h2>
          <Seg value={minutes} onChange={setMinutes} label="Время на тренировку" options={['45', '60', '75', '90'].map((m) => [m, m])} />
          <h2 className="group-title">Чему добавить объём (до двух, необязательно)</h2>
          <div className="chips" role="group" aria-label="Приоритетные мышцы">
            {PRIORITY.map((m) => {
              const on = priority.includes(m);
              return (
                <button key={m} type="button" aria-pressed={on} disabled={!on && priority.length >= 2} onClick={() => setPriority(on ? priority.filter((x) => x !== m) : [...priority, m])}>
                  {MUSCLE_RU[m]}
                </button>
              );
            })}
          </div>
          <p className="caption" style={{ margin: '16px 0 0' }}>
            Стаж {settings.trainingYears} {settings.trainingYears === 1 ? 'год' : 'лет'}.{' '}
            {flags.length ? `Учтены ограничения: ${flags.map((f) => f.label.toLowerCase()).join(', ')}.` : 'Ограничений по здоровью не отмечено.'} Изменить — в настройках.
          </p>
          <div className="actions">
            <button className="btn btn-primary" onClick={build}>
              {draft ? 'Собрать заново' : 'Собрать программу'}
            </button>
            {current && (
              <button
                className="btn"
                onClick={() => {
                  setWizard(false);
                  setDraft(null);
                }}
              >
                Отмена
              </button>
            )}
          </div>
        </Card>

        {draft && (
          <>
            <h2 className="group-title">{draft.name}</h2>
            {draft.notes.map((n) => (
              <p key={n} className="note note-warn" style={{ margin: '0 0 12px' }}>
                <Icon name="warning" size={18} />
                <span>{n}</span>
              </p>
            ))}
            {draft.days.map((d) => (
              <DayCard key={d.name} day={d} />
            ))}
            <Card title="Объём за неделю">
              <div style={{ marginTop: 16 }}>
                <Volume days={draft.days} />
              </div>
            </Card>
            <Sources />
            <button
              className="btn btn-primary btn-block"
              onClick={async () => {
                await saveProgram(draft);
                setDraft(null);
                setWizard(false);
                toast('Программа сохранена и выбрана текущей');
                window.scrollTo(0, 0);
              }}
            >
              Сохранить и тренироваться по ней
            </button>
          </>
        )}
        {!current && (
          <a className="btn btn-block" href="#strength" style={{ marginTop: 12 }}>
            К тренировкам
          </a>
        )}
      </div>
    );
  }

  const others = programs.filter((p) => p.id !== current.id);
  return (
    <div>
      <ScreenHead title="Программа" sub={`${current.name}. Собрана ${fmtDate(current.createdAt)}`} />
      {current.notes.map((n) => (
        <p key={n} className="note note-warn" style={{ margin: '0 0 12px' }}>
          <Icon name="warning" size={18} />
          <span>{n}</span>
        </p>
      ))}
      {current.days.map((d, i) => (
        <DayCard key={d.name} day={d} badge={i === current.nextDay ? 'следующий' : undefined} onStart={() => void start(current, i)} onSwap={(index) => setSwap({ day: i, index })} />
      ))}

      <div className="section-gap">
        <Fold title="Объём за неделю">
          <Volume days={current.days} />
        </Fold>
        <Sources />
        {others.length > 0 && (
          <Fold title={`Другие программы: ${others.length}`}>
            <ul className="entries">
              {others.map((p) => (
                <li key={p.id} className="entry">
                  <div className="entry-main">
                    <b>{p.name}</b>
                    <small className="muted">Собрана {fmtDate(p.createdAt)}</small>
                  </div>
                  <IconButton icon="check" label={`Сделать текущей: ${p.name}`} onClick={() => void saveSettings({ activeProgramId: p.id! })} />
                  <IconButton
                    icon="trash"
                    tone="danger"
                    label={`Удалить программу ${p.name}`}
                    onClick={() => {
                      if (confirm(`Удалить программу «${p.name}»? Записанные тренировки останутся.`)) void deleteProgram(p.id!, settings.activeProgramId);
                    }}
                  />
                </li>
              ))}
            </ul>
          </Fold>
        )}
      </div>

      <div className="actions">
        <button className="btn" onClick={() => setWizard(true)}>
          Собрать новую
        </button>
        <button
          className="btn btn-danger"
          onClick={() => {
            if (confirm(`Удалить программу «${current.name}»? Записанные тренировки останутся.`)) void deleteProgram(current.id!, settings.activeProgramId);
          }}
        >
          Удалить программу
        </button>
      </div>

      <Sheet open={!!swap} onClose={() => setSwap(null)} title="Заменить упражнение">
        {swap && (
          <div className="stack">
            <p className="tiny muted">
              Вместо «{current.days[swap.day].exercises[swap.index].name}». Подходы, повторы и отдых останутся прежними. Показаны варианты под ваше оборудование и без отмеченных рисков.
            </p>
            {swapOptions.length === 0 ? (
              <p>Подходящих замен в каталоге нет.</p>
            ) : (
              <ul className="entries">
                {swapOptions.map((n) => (
                  <li key={n}>
                    <button
                      className="rowbtn"
                      onClick={async () => {
                        const nextDays = current.days.map((d, di) => (di !== swap.day ? d : { ...d, exercises: d.exercises.map((e, ei) => (ei !== swap.index ? e : { ...e, name: n })) }));
                        await getDb().programs.update(current.id!, { days: nextDays });
                        setSwap(null);
                        toast('Упражнение заменено');
                      }}
                    >
                      {n}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
