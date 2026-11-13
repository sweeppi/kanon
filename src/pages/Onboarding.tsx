// Первый запуск: персонализация для любого пользователя (пол, возраст, рост, вес, цель, стаж, активность, ограничения).
import { useState } from 'react';
import { useStore } from '../lib/store';
import { getDb, type Settings } from '../lib/data/db';
import { Card, NumField, Seg, useToast } from '../components/ui';
import { ActivityEditor, HealthEditor } from '../components/ProfileEditors';
import { today } from '../lib/derive';

export function Onboarding() {
  const { settings, setSettings, d } = useStore();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [s, setS] = useState<Settings>(settings);
  const [weight, setWeight] = useState<number | undefined>(d.values.weight);
  const set = (p: Partial<Settings>) => setS((cur) => ({ ...cur, ...p }));
  const steps = ['О вас', 'Цель', 'Активность', 'Здоровье'];

  const finish = async () => {
    await setSettings({ ...s, onboarded: true });
    if (weight && weight !== d.values.weight) {
      const db = getDb();
      const ex = await db.measurements.where('date').equals(today()).first();
      if (ex?.id) await db.measurements.update(ex.id, { weight, height: s.heightCm });
      else await db.measurements.add({ date: today(), weight, height: s.heightCm });
    }
    toast('Профиль сохранён. Всё можно изменить в Настройках.');
  };

  return (
    <div>
      <header className="screen-head" style={{ paddingBottom: 0 }}>
        <div>
          <h1 className="display">Настроим под вас</h1>
          <p>
            Шаг {step + 1} из {steps.length}: {steps[step]}. Данные остаются только на этом устройстве.
          </p>
        </div>
      </header>
      <div className="steps" aria-hidden="true">
        {steps.map((x, i) => (
          <i key={x} className={i <= step ? 'on' : ''} />
        ))}
      </div>

      {step === 0 && (
        <Card>
          <Seg<Settings['sex']>
            value={s.sex}
            onChange={(v) => set({ sex: v })}
            label="Пол"
            options={[
              ['male', 'Мужчина'],
              ['female', 'Женщина'],
            ]}
          />
          <p className="caption" style={{ margin: '8px 0 0' }}>Нужен для формул (% жира, BMR, нормативы силы) и 3D-модели.</p>
          <div className="grid2" style={{ marginTop: 16 }}>
            <NumField label="Возраст" unit="лет" min={14} max={90} step={1} value={s.age} onChange={(v) => v && set({ age: v })} />
            <NumField label="Рост" unit="см" min={120} max={230} value={s.heightCm} onChange={(v) => v && set({ heightCm: v })} />
            <NumField label="Вес сейчас" unit="кг" min={30} max={250} value={weight} onChange={setWeight} />
            <NumField label="Стаж тренировок" unit="лет" min={0} max={50} value={s.trainingYears} onChange={(v) => v !== undefined && set({ trainingYears: v })} />
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <div className="grid2">
            <NumField label="Целевой вес" unit="кг" min={30} max={250} value={s.goalWeightKg || undefined} onChange={(v) => set({ goalWeightKg: v ?? 0 })} hint="Можно оставить пустым" />
            <NumField label="Целевой % жира" unit="%" min={4} max={45} value={s.goalBodyFat} onChange={(v) => v && set({ goalBodyFat: v })} hint={s.sex === 'male' ? 'Рельеф ≈ 10–12 %' : 'Рельеф ≈ 18–22 %'} />
            <NumField label="Темп сушки" unit="%/нед" min={0.25} max={1.5} step={0.05} value={s.cutRatePct} onChange={(v) => v && set({ cutRatePct: v })} hint="Рекомендуют 0,5–1 % массы в неделю" />
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <ActivityEditor s={s} set={set} weightKg={weight} />
        </Card>
      )}

      {step === 3 && (
        <Card>
          <HealthEditor s={s} set={set} />
        </Card>
      )}

      <div className="actions">
        <button className="btn" onClick={() => (step === 0 ? void setSettings({ onboarded: true }) : setStep(step - 1))}>
          {step === 0 ? 'Пропустить' : 'Назад'}
        </button>
        {step < steps.length - 1 ? (
          <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
            Далее
          </button>
        ) : (
          <button className="btn btn-primary" onClick={finish}>
            Готово
          </button>
        )}
      </div>
    </div>
  );
}
