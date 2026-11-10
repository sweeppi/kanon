// Расход энергии на активность по шагам, тренировкам и работе стоя — вместо «угадывания» коэффициента.
// Модель (приближение): TDEE = BMR × 1.2 (сидячий базис: быт + термический эффект пищи)
//   + ходьба сверх ~4000 базовых шагов + тренировки + работа стоя.
// Чистый расход активности = (MET − 1) × кг × часы. MET — из Compendium of Physical Activities
// (Ainsworth 2011, PMID 21681120; Herrmann 2024, PMID 38242596): ходьба в умеренном темпе ≈ 3.5,
// силовая тренировка умеренная ≈ 3.5 / интенсивная ≈ 6.0, работа стоя с перемещениями ≈ 2.0 (против ≈ 1.3 сидя).

export interface ActivityProfile {
  stepsPerDay: number;
  trainingsPerWeek: number;
  trainingMinutes: number;
  trainingIntensity: 'moderate' | 'vigorous';
  /** часы в неделю на ногах без ходьбы (официант, продавец) — ходьба уже учтена шагами */
  standingHoursPerWeek: number;
}

export const DEFAULT_ACTIVITY: ActivityProfile = {
  stepsPerDay: 7000,
  trainingsPerWeek: 3,
  trainingMinutes: 60,
  trainingIntensity: 'moderate',
  standingHoursPerWeek: 0,
};

export const BASE_STEPS = 4000; // столько шагов «входит» в сидячий коэффициент 1.2
export const STEPS_PER_MIN = 100; // умеренный темп ходьбы
export const MET = { walk: 3.5, trainModerate: 3.5, trainVigorous: 6.0, standing: 2.0, sitting: 1.3 } as const;

export interface ActivityBreakdown {
  base: number;
  walking: number;
  training: number;
  standing: number;
  tdee: number;
  /** итоговый коэффициент TDEE / BMR — для сравнения с табличными 1.2–1.9 */
  factor: number;
}

export function activityTdee(bmr: number, weightKg: number, a: ActivityProfile): ActivityBreakdown {
  const base = bmr * 1.2;
  const extraSteps = Math.max(0, a.stepsPerDay - BASE_STEPS);
  const walking = (MET.walk - 1) * weightKg * (extraSteps / STEPS_PER_MIN / 60);
  const met = a.trainingIntensity === 'vigorous' ? MET.trainVigorous : MET.trainModerate;
  const training = ((met - 1) * weightKg * (a.trainingMinutes / 60) * a.trainingsPerWeek) / 7;
  const standing = ((MET.standing - MET.sitting) * weightKg * a.standingHoursPerWeek) / 7;
  const tdee = base + walking + training + standing;
  return { base, walking, training, standing, tdee, factor: tdee / bmr };
}
