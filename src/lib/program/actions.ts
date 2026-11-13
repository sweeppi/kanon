// Действия с базой для программ и идущей тренировки (тонкая обёртка над чистыми функциями session.ts).
import { getDb, saveSettings } from '../data/db';
import type { WorkoutSet } from '../hevy/hevy';
import { startWorkout, toWorkoutSets } from './session';
import type { ActiveWorkout, Program } from './types';

const KEY = 'activeWorkout';

export async function saveActive(w: ActiveWorkout): Promise<void> {
  await getDb().kv.put({ key: KEY, value: w });
}

/** Начать тренировку: по дню программы или свободную (без упражнений — их добавляют по ходу). */
export async function beginWorkout(history: WorkoutSet[], program?: Program, dayIndex?: number): Promise<void> {
  const day = program && dayIndex !== undefined ? program.days[dayIndex] : undefined;
  await saveActive(startWorkout({ title: day?.name ?? 'Свободная тренировка', day, programId: program?.id, dayIndex, history }));
}

/** Завершить: отмеченные подходы уходят в общий журнал, программа переключается на следующий день. */
export async function finishWorkout(w: ActiveWorkout): Promise<number> {
  const db = getDb();
  const rows = toWorkoutSets(w);
  await db.transaction('rw', db.sets, db.kv, db.programs, async () => {
    if (rows.length) await db.sets.bulkPut(rows);
    if (rows.length && w.programId !== undefined && w.dayIndex !== undefined) {
      const p = await db.programs.get(w.programId);
      if (p) await db.programs.update(w.programId, { nextDay: (w.dayIndex + 1) % p.days.length });
    }
    await db.kv.delete(KEY);
  });
  return rows.length;
}

export async function discardWorkout(): Promise<void> {
  await getDb().kv.delete(KEY);
}

export async function saveProgram(p: Program): Promise<number> {
  const id = (await getDb().programs.add(p)) as number;
  await saveSettings({ activeProgramId: id });
  return id;
}

export async function deleteProgram(id: number, activeId: number | null): Promise<void> {
  await getDb().programs.delete(id);
  if (activeId === id) await saveSettings({ activeProgramId: null });
}
