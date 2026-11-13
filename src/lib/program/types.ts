// Программы тренировок и «тренировка сейчас»: типы данных.
import type { Muscle } from '../hevy/exercises';
import type { HealthFlags } from '../health';

export type Goal = 'muscle' | 'strength';
/** Что есть в распоряжении: полный зал, только гантели и скамья, только свой вес и турник. */
export type Gear = 'gym' | 'dumbbells' | 'bodyweight';

export interface GenParams {
  daysPerWeek: number; // 2–6
  gear: Gear;
  goal: Goal;
  trainingYears: number;
  /** сколько минут есть на тренировку */
  minutes: number;
  healthFlags: HealthFlags;
  /** мышцы, которым добавить объём (не больше двух) */
  priority: Muscle[];
}

export interface PlanExercise {
  name: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
}

export interface PlanDay {
  name: string;
  exercises: PlanExercise[];
}

export interface Program {
  id?: number;
  name: string;
  createdAt: string;
  days: PlanDay[];
  /** индекс дня, который идёт следующим */
  nextDay: number;
  params?: GenParams;
  /** пояснения генератора: что убрано из-за ограничений, где объём ниже ориентира */
  notes: string[];
}

export interface ActiveSet {
  weightKg: number | null;
  reps: number | null;
  done: boolean;
}

export interface ActiveExercise {
  name: string;
  repsMin: number;
  repsMax: number;
  restSec: number;
  sets: ActiveSet[];
}

/** Идущая тренировка. Хранится в IndexedDB, поэтому переживает перезагрузку и закрытие приложения. */
export interface ActiveWorkout {
  /** начало, локальное время YYYY-MM-DDTHH:mm — оно же часть ключа подходов */
  start: string;
  title: string;
  programId?: number;
  dayIndex?: number;
  exercises: ActiveExercise[];
  /** когда закончится отдых (мс с начала эпохи) — таймер считается от времени, а не тиками */
  restEndsAt: number | null;
  restTotalSec: number | null;
}
