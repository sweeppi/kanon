// «Тренировка сейчас»: подходы, прошлый результат, таймер отдыха, экран не гаснет.
// Состояние хранится в IndexedDB и переживает перезагрузку. Подходы попадают в общий журнал при завершении.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { Card, ScreenHead, IconButton, Sheet, fmt, fmtDate, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { beginWorkout, discardWorkout, finishWorkout, saveActive } from '../lib/program/actions';
import { doneCount, fmtClock, lastResult, restRemaining, toActiveExercise } from '../lib/program/session';
import { CATALOG_NAMES } from '../lib/program/catalog';
import { lookupExercise } from '../lib/hevy/exercises';
import { flagsForTags } from '../lib/health';
import type { ActiveWorkout } from '../lib/program/types';
import { useHashAction } from '../lib/useHashAction';

// ── сигнал об окончании отдыха ──
// Звук создаётся при первом нажатии «подход сделан»: без жеста пользователя Safari не даёт играть звук.
let audio: AudioContext | null = null;
function armSound() {
  try {
    audio ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}
function beep() {
  try {
    if (!audio) return;
    for (const at of [0, 0.3]) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audio.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.3, audio.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + at + 0.22);
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + at);
      o.stop(audio.currentTime + at + 0.25);
    }
  } catch {
    /* звук недоступен — остаётся сигнал на экране */
  }
  // В Safari на iOS вибрации из браузера нет; там, где она есть, — используем
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* нет вибрации */
  }
}

/** Экран не гаснет, пока открыта тренировка. Возвращает, удалось ли это включить. */
function useWakeLock(on: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (gone) void lock.release();
        else setHeld(true);
        lock.addEventListener('release', () => setHeld(false));
      } catch {
        setHeld(false); // например, включён режим энергосбережения
      }
    };
    // система снимает блокировку, когда приложение уходит в фон, — берём заново при возврате
    const onVis = () => document.visibilityState === 'visible' && void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, [on]);
  return held;
}

/** Числовое поле подхода: запятая или точка, пустое значение = не введено. */
function SetInput({ value, onChange, label, placeholder }: { value: number | null; onChange: (v: number | null) => void; label: string; placeholder?: string }) {
  const [draft, setDraft] = useState(value === null ? '' : String(value).replace('.', ','));
  useEffect(() => {
    const parsed = draft.trim() === '' ? null : Number(draft.replace(',', '.'));
    if (parsed !== value) setDraft(value === null ? '' : String(value).replace('.', ','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const n = draft.trim() === '' ? null : Number(draft.replace(',', '.'));
  const bad = n !== null && !(Number.isFinite(n) && n >= 0 && n <= 1000);
  return (
    <input
      inputMode="decimal"
      aria-label={label}
      aria-invalid={bad}
      className={bad ? 'invalid' : ''}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => {
        const s = e.target.value;
        setDraft(s);
        const v = s.trim() === '' ? null : Number(s.replace(',', '.'));
        if (v === null || (Number.isFinite(v) && v >= 0 && v <= 1000)) onChange(v);
      }}
    />
  );
}

function RestBar({ w, onChange }: { w: ActiveWorkout; onChange: (w: ActiveWorkout) => void }) {
  const [now, setNow] = useState(Date.now());
  const fired = useRef<number | null>(null);
  useEffect(() => {
    if (w.restEndsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [w.restEndsAt]);
  const left = restRemaining(w.restEndsAt, now);
  useEffect(() => {
    if (w.restEndsAt !== null && left === 0 && fired.current !== w.restEndsAt) {
      fired.current = w.restEndsAt;
      // если вернулись из фона сильно позже срока — сигнал уже не нужен
      if (Date.now() - w.restEndsAt < 5000) beep();
    }
  }, [left, w.restEndsAt]);
  if (w.restEndsAt === null) return null;
  const total = w.restTotalSec ?? 1;
  const over = left === 0;
  return (
    <div className={`restbar${over ? ' restbar-over' : ''}`} role="timer" aria-live="off" aria-label={over ? 'Отдых окончен' : `Отдых, осталось ${fmtClock(left)}`}>
      <div className="restbar-fill" style={{ width: `${over ? 100 : Math.min(100, (1 - left / total) * 100)}%` }} />
      <div className="restbar-row">
        <div>
          <span className="caption">{over ? 'Отдых окончен' : 'Отдых'}</span>
          <b className="restbar-clock">{over ? 'Пора' : fmtClock(left)}</b>
        </div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          {!over && (
            <button className="btn btn-small" onClick={() => onChange({ ...w, restEndsAt: w.restEndsAt! + 30_000, restTotalSec: total + 30 })}>
              +30 с
            </button>
          )}
          <button className="btn btn-small" onClick={() => onChange({ ...w, restEndsAt: null, restTotalSec: null })}>
            {over ? 'Закрыть' : 'Пропустить'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Workout() {
  const { active: w, sets: history, programs, settings, ready } = useStore();
  const toast = useToast();
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [, tick] = useState(0);
  const held = useWakeLock(!!w);

  // длительность в заголовке обновляется раз в 30 секунд
  useEffect(() => {
    if (!w) return;
    const id = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(id);
  }, [w]);

  const names = useMemo(() => {
    const own = [...new Set(history.map((s) => s.exercise))];
    const all = [...new Set([...CATALOG_NAMES, ...own])];
    const q = query.trim().toLowerCase();
    return (q ? all.filter((n) => n.toLowerCase().includes(q)) : all).slice(0, 40);
  }, [history, query]);

  const program = programs.find((p) => p.id === settings.activeProgramId);

  // ссылка-действие «#workout?start=1» (Быстрая команда): начать следующий день программы, если тренировка ещё не идёт
  // Ждём загрузки базы (ready): иначе идущая тренировка ещё «не видна» и ссылка затёрла бы её.
  useHashAction('workout', (p) => p.get('start') === '1' && !w && void beginWorkout(history, program, program?.nextDay), ready);

  if (!w) {
    return (
      <div>
        <ScreenHead title="Тренировка" />
        <Card>
          <div className="empty">
            <p>Сейчас тренировка не идёт.</p>
            <div className="actions" style={{ marginTop: 0, justifyContent: 'center' }}>
              {program && (
                <button className="btn btn-primary" onClick={() => void beginWorkout(history, program, program.nextDay)}>
                  Начать «{program.days[program.nextDay]?.name}»
                </button>
              )}
              <button className={`btn${program ? '' : ' btn-primary'}`} onClick={() => void beginWorkout(history)}>
                Свободная тренировка
              </button>
            </div>
          </div>
        </Card>
        <a className="btn btn-block" href="#strength">
          К тренировкам
        </a>
      </div>
    );
  }

  const update = (next: ActiveWorkout) => void saveActive(next);
  const patchSet = (ei: number, si: number, p: Partial<ActiveWorkout['exercises'][number]['sets'][number]>, rest?: number) => {
    const exercises = w.exercises.map((e, i) => {
      if (i !== ei) return e;
      const weight = { ...e.sets[si], ...p }.weightKg;
      // когда подход отмечен, его вес подставляется в следующие ещё пустые подходы — не вводить одно и то же
      return { ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, ...p } : p.done && j > si && !s.done && s.weightKg === null ? { ...s, weightKg: weight } : s)) };
    });
    update({ ...w, exercises, ...(rest !== undefined ? { restEndsAt: Date.now() + rest * 1000, restTotalSec: rest } : {}) });
  };
  const patchExercise = (ei: number, fn: (e: ActiveWorkout['exercises'][number]) => ActiveWorkout['exercises'][number] | null) => {
    const exercises = w.exercises.flatMap((e, i) => {
      if (i !== ei) return [e];
      const r = fn(e);
      return r ? [r] : [];
    });
    update({ ...w, exercises });
  };
  const addExercise = (name: string) => {
    const n = name.trim();
    if (!n) return;
    update({ ...w, exercises: [...w.exercises, toActiveExercise({ name: n, sets: 3, repsMin: 8, repsMax: 12, restSec: 120 }, history, w.start)] });
    setPicker(false);
    setQuery('');
  };

  const done = doneCount(w);
  const total = w.exercises.reduce((a, e) => a + e.sets.length, 0);
  const startMs = new Date(w.start).getTime();
  const minutes = Math.max(0, Math.round((Date.now() - startMs) / 60000));
  const notReady = w.exercises.flatMap((e) => e.sets).filter((s) => s.done && !(s.reps !== null && s.reps > 0)).length;

  return (
    <div className={w.restEndsAt !== null ? 'has-restbar' : ''}>
      <ScreenHead
        title={w.title}
        sub={`Идёт ${minutes} мин, подходов сделано: ${done} из ${total}${held ? '. Экран не погаснет' : ''}`}
        action={
          <button className="btn btn-small btn-primary" onClick={() => setFinishing(true)}>
            Завершить
          </button>
        }
      />

      {w.exercises.length === 0 && (
        <Card>
          <p className="muted" style={{ margin: 0 }}>
            Упражнений пока нет. Добавьте первое — подходы и отдых отметите по ходу.
          </p>
        </Card>
      )}

      {w.exercises.map((e, ei) => {
        const last = lastResult(history, e.name, w.start);
        const flags = flagsForTags(lookupExercise(e.name)?.tags, settings.healthFlags);
        return (
          <Card key={`${e.name}-${ei}`}>
            <div className="spread" style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ overflowWrap: 'anywhere' }}>{e.name}</h2>
                <p className="caption" style={{ margin: '4px 0 0' }}>
                  {e.sets.length} × {e.repsMin}–{e.repsMax}, отдых {fmtClock(e.restSec)}
                </p>
              </div>
              <IconButton
                icon="trash"
                label={`Убрать упражнение ${e.name}`}
                onClick={() => {
                  if (!e.sets.some((s) => s.done) || confirm(`Убрать «${e.name}» вместе с отмеченными подходами?`)) patchExercise(ei, () => null);
                }}
              />
            </div>
            {flags.length > 0 && (
              <p className="note note-warn" style={{ margin: '8px 0 0' }}>
                <Icon name="warning" size={18} />
                <span>Отмечено ограничение: {flags.map((f) => f.label.toLowerCase()).join(', ')}</span>
              </p>
            )}
            <p className="caption" style={{ margin: '8px 0 12px' }}>
              {last ? `Прошлый раз, ${fmtDate(last.date)}: ${last.sets.map((s) => `${s.weightKg !== null ? fmt(s.weightKg, s.weightKg % 1 ? 1 : 0) : '—'} × ${s.reps ?? '—'}`).join(', ')}` : 'Раньше это упражнение не записывалось'}
            </p>

            <div className="setrow setrow-head" aria-hidden="true">
              <span>№</span>
              <span>Вес, кг</span>
              <span>Повторы</span>
              <span />
            </div>
            {e.sets.map((s, si) => (
              <div key={si} className={`setrow${s.done ? ' is-done' : ''}`}>
                <span className="setrow-n">{si + 1}</span>
                <SetInput value={s.weightKg} label={`${e.name}, подход ${si + 1}: вес в килограммах`} placeholder="кг" onChange={(v) => patchSet(ei, si, { weightKg: v })} />
                <SetInput
                  value={s.reps}
                  label={`${e.name}, подход ${si + 1}: повторы`}
                  placeholder={last?.sets[Math.min(si, last.sets.length - 1)]?.reps != null ? String(last.sets[Math.min(si, last.sets.length - 1)].reps) : `${e.repsMin}–${e.repsMax}`}
                  onChange={(v) => patchSet(ei, si, { reps: v })}
                />
                <button
                  type="button"
                  className={`iconbtn${s.done ? ' iconbtn-primary' : ''}`}
                  aria-pressed={s.done}
                  aria-label={s.done ? `Подход ${si + 1} сделан, снять отметку` : `Отметить подход ${si + 1} сделанным и запустить отдых`}
                  onClick={() => {
                    if (s.done) return patchSet(ei, si, { done: false });
                    if (!(s.reps !== null && s.reps > 0)) return toast('Сначала введите повторы');
                    armSound();
                    patchSet(ei, si, { done: true }, e.restSec);
                  }}
                >
                  <Icon name="check" size={20} />
                </button>
              </div>
            ))}
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn btn-small" onClick={() => patchExercise(ei, (x) => ({ ...x, sets: [...x.sets, { weightKg: x.sets.at(-1)?.weightKg ?? null, reps: null, done: false }] }))}>
                Добавить подход
              </button>
              {e.sets.length > 1 && !e.sets.at(-1)!.done && (
                <button className="btn btn-small" onClick={() => patchExercise(ei, (x) => ({ ...x, sets: x.sets.slice(0, -1) }))}>
                  Убрать последний
                </button>
              )}
            </div>
          </Card>
        );
      })}

      <button className="btn btn-block" onClick={() => setPicker(true)}>
        <Icon name="plus" size={18} />
        Добавить упражнение
      </button>

      <RestBar w={w} onChange={update} />

      <Sheet open={picker} onClose={() => setPicker(false)} title="Добавить упражнение">
        <div className="stack">
          <label className="field">
            <span className="field-label">Название</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Начните вводить или выберите ниже" />
          </label>
          {query.trim() !== '' && !names.some((n) => n.toLowerCase() === query.trim().toLowerCase()) && (
            <button className="btn btn-block" onClick={() => addExercise(query)}>
              Добавить «{query.trim()}»
            </button>
          )}
          <ul className="entries">
            {names.map((n) => (
              <li key={n}>
                <button className="rowbtn" onClick={() => addExercise(n)}>
                  {n}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>

      <Sheet open={finishing} onClose={() => setFinishing(false)} title="Завершить тренировку?">
        <div className="stack">
          <p>
            Отмечено подходов: <b>{done}</b> из {total}, длительность {minutes} мин. В журнал попадут только отмеченные подходы.
          </p>
          {notReady > 0 && <p className="note note-warn">Подходов без повторов: {notReady} — они не сохранятся.</p>}
          <button
            className="btn btn-primary btn-block"
            onClick={async () => {
              try {
                const n = await finishWorkout(w);
                setFinishing(false);
                toast(n ? `Тренировка сохранена, подходов: ${n}` : 'Тренировка закрыта без подходов');
                location.hash = 'strength';
              } catch (err) {
                toast(`Не сохранилось: ${(err as Error).message}. Тренировка осталась открытой.`);
              }
            }}
          >
            {done > 0 ? 'Сохранить тренировку' : 'Закрыть без подходов'}
          </button>
          {done > 0 && (
            <button
              className="btn btn-danger btn-block"
              onClick={async () => {
                if (!confirm('Удалить эту тренировку без сохранения? Отмеченные подходы пропадут.')) return;
                await discardWorkout();
                setFinishing(false);
                location.hash = 'strength';
              }}
            >
              Удалить без сохранения
            </button>
          )}
          <button className="btn btn-block" onClick={() => setFinishing(false)}>
            Продолжить тренировку
          </button>
        </div>
      </Sheet>
    </div>
  );
}
