import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { getDb, TABLES, type Settings } from '../lib/data/db';
import { exportBackup, importBackup, validateBackup, canonical, measurementsCsv, workoutsCsv, downloadFile, BackupError, type BackupFile } from '../lib/data/backup';
import { Card, NumField, Seg, useToast, fmtDate, pickFile, Sheet, fmt } from '../components/ui';
import { buildIcs, defaultReminders } from '../lib/ics';
import { today } from '../lib/derive';
import { isIOS, isStandalone } from '../lib/platform';
import { FIELDS } from '../lib/measureMeta';

export function SettingsPage() {
  const { settings: s, setSettings, ms, sets } = useStore();
  const toast = useToast();
  const set = (p: Partial<Settings>) => void setSettings(p);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');
  const [restore, setRestore] = useState<{ file: BackupFile; name: string } | null>(null);
  const [verify, setVerify] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setPersisted(navigator.storage?.persisted ? await navigator.storage.persisted() : null);
        const e = await navigator.storage?.estimate?.();
        if (e?.usage !== undefined) setUsage(`${(e.usage / 1048576).toFixed(1)} МБ из ~${((e.quota ?? 0) / 1048576 / 1024).toFixed(1)} ГБ`);
      } catch {
        setPersisted(null);
      }
    })();
  }, []);

  const doBackup = async () => {
    try {
      const b = await exportBackup();
      downloadFile(`kanon-backup-${today()}.json`, JSON.stringify(b));
      await setSettings({ lastBackupAt: new Date().toISOString() });
      toast('Бэкап сохранён. На iPhone выберите «Сохранить в Файлы».');
    } catch (e) {
      toast(`Бэкап не удался: ${(e as Error).message}`);
    }
  };
  const chooseRestore = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const file = validateBackup(JSON.parse(await f.text()));
      setRestore({ file, name: f.name });
    } catch (e) {
      toast(e instanceof BackupError ? e.message : `Файл не прочитан: ${(e as Error).message}`);
    }
  };
  const doRestore = async () => {
    if (!restore) return;
    try {
      await importBackup(restore.file);
      // проверка: экспортируем снова и сравниваем с файлом
      const again = await exportBackup();
      const ok = canonical(again) === canonical(restore.file);
      setVerify(ok ? '✓ Восстановлено. Проверка: данные полностью совпадают с файлом бэкапа.' : '⚠ Восстановлено, но проверка нашла расхождения — сохраните оба файла и сообщите об ошибке.');
      setRestore(null);
      // помним, что у пользователя есть этот бэкап (после сверки, чтобы не влиять на проверку)
      await setSettings({ lastBackupAt: restore.file.exportedAt });
    } catch (e) {
      toast(`Восстановление не удалось, данные не изменены: ${(e as Error).message}`);
    }
  };

  return (
    <div>
      <h1>Настройки</h1>

      <Card title="Профиль">
        <div className="grid2">
          <label className="field">
            <span className="field-label">Пол (для формул)</span>
            <select value={s.sex} onChange={(e) => set({ sex: e.target.value as Settings['sex'] })}>
              <option value="male">Мужской</option>
              <option value="female">Женский</option>
            </select>
          </label>
          <NumField label="Возраст" unit="лет" min={14} max={90} step={1} value={s.age} onChange={(v) => v && set({ age: v })} />
          <NumField label="Рост" unit="см" min={120} max={230} value={s.heightCm} onChange={(v) => v && set({ heightCm: v })} hint="Если рост есть в замерах — берётся оттуда" />
          <NumField label="Стаж" unit="лет" min={0} max={50} value={s.trainingYears} onChange={(v) => v !== undefined && set({ trainingYears: v })} />
          <NumField label="Активность (×BMR)" min={1.1} max={2.2} value={s.activityFactor} onChange={(v) => v && set({ activityFactor: v })} hint="1,2 сидячий · 1,55 3–5 тренировок · 1,725 очень активный" />
        </div>
      </Card>

      <Card title="Цели">
        <div className="grid2">
          <NumField label="Целевой вес" unit="кг" min={35} max={200} value={s.goalWeightKg} onChange={(v) => v && set({ goalWeightKg: v })} />
          <NumField label="Целевой % жира" unit="%" min={4} max={40} value={s.goalBodyFat} onChange={(v) => v && set({ goalBodyFat: v })} />
          <NumField label="Темп сушки" unit="%/нед" min={0.25} max={1.5} step={0.05} value={s.cutRatePct} onChange={(v) => v && set({ cutRatePct: v })} hint="Рекомендуют 0,5–1 % (Helms 2014)" />
          <div />
          <NumField label="Ккал вручную" unit="ккал" min={800} max={6000} step={10} value={s.kcalOverride} onChange={(v) => set({ kcalOverride: v ?? null })} hint="Пусто — считается автоматически" />
          <NumField label="Белок вручную" unit="г" min={30} max={400} step={1} value={s.proteinOverride} onChange={(v) => set({ proteinOverride: v ?? null })} hint="Пусто — по Morton/Helms" />
        </div>
        <details style={{ marginTop: 8 }}>
          <summary>Целевые обхваты для режима «Цель» (необязательно)</summary>
          <p className="tiny muted">По умолчанию цель = пропорции Ривза. Здесь можно задать свои.</p>
          <div className="grid2">
            {FIELDS.filter((f) => !['weight', 'height', 'bodyFatInput', 'wrist', 'ankle', 'knee'].includes(f.key)).map((f) => (
              <NumField
                key={f.key}
                label={f.label}
                unit={f.unit}
                min={f.min}
                max={f.max}
                value={s.goalMeasurements[f.key]}
                onChange={(v) => {
                  const g = { ...s.goalMeasurements };
                  if (v === undefined) delete g[f.key];
                  else g[f.key] = v;
                  set({ goalMeasurements: g });
                }}
              />
            ))}
          </div>
        </details>
      </Card>

      <Card title="Здоровье">
        <label className="row">
          <input type="checkbox" checked={s.healthFlags.hyperlordosis} onChange={(e) => set({ healthFlags: { ...s.healthFlags, hyperlordosis: e.target.checked } })} />
          <span>
            Гиперлордоз
            <div className="tiny muted">Упражнения с осевой нагрузкой на поясницу помечаются ⚠, предлагаются альтернативы и стабилизация кора. Это подсказка, а не диагноз.</div>
          </span>
        </label>
      </Card>

      <Card title="Оформление">
        <Seg<Settings['theme']>
          value={s.theme}
          onChange={(t) => set({ theme: t })}
          label="Тема"
          options={[
            ['dark', 'Тёмная'],
            ['light', 'Светлая'],
            ['system', 'Как в системе'],
          ]}
        />
      </Card>

      <Card title="Бэкап и экспорт">
        <p className="tiny">
          Все данные хранятся только на этом устройстве. Последний бэкап: <b>{s.lastBackupAt ? fmtDate(s.lastBackupAt) : 'не было'}</b>. Делайте бэкап раз в неделю и храните файл в «Файлах» / iCloud Drive.
        </p>
        <div className="grid2">
          <button className="btn btn-primary" onClick={doBackup}>
            Сохранить бэкап (JSON)
          </button>
          <button className="btn" onClick={chooseRestore}>
            Восстановить…
          </button>
          <button className="btn" disabled={!ms.length} onClick={() => downloadFile(`kanon-zamery-${today()}.csv`, measurementsCsv(ms), 'text/csv')}>
            Замеры → CSV
          </button>
          <button className="btn" disabled={!sets.length} onClick={() => downloadFile(`kanon-trenirovki-${today()}.csv`, workoutsCsv(sets), 'text/csv')}>
            Тренировки → CSV
          </button>
        </div>
        {verify && (
          <p className="tiny" style={{ marginTop: 8, color: verify.startsWith('✓') ? 'var(--good)' : 'var(--warn)' }}>
            {verify}
          </p>
        )}
      </Card>

      <Card title="Хранилище и установка">
        <ul className="list tiny">
          <li>
            Постоянное хранилище: <b>{persisted === null ? 'неизвестно' : persisted ? 'разрешено' : 'не разрешено'}</b>
            {!persisted && (
              <button
                className="btn btn-small"
                style={{ marginLeft: 8 }}
                onClick={async () => {
                  const r = await navigator.storage?.persist?.();
                  setPersisted(!!r);
                  toast(r ? 'Браузер обещал не удалять данные' : 'Браузер отказал — установите приложение на экран «Домой»');
                }}
              >
                Запросить
              </button>
            )}
          </li>
          <li>Занято: {usage || '—'}</li>
          <li>Режим: {isStandalone() ? 'установлено как приложение ✓' : 'открыто во вкладке браузера'}</li>
        </ul>
        <p className="tiny muted">
          Важно для iPhone: Safari может стереть данные сайта, который не установлен на экран «Домой» и не открывался ~7 дней. Установка: {isIOS() ? '' : 'на iPhone в Safari — '}«Поделиться» → «На экран „Домой“». Даже после установки делайте бэкапы: удаление иконки удаляет и данные.
        </p>
      </Card>

      <Card title="Напоминания">
        <p className="tiny muted">Push-уведомления на iOS требуют сервер, поэтому используем календарь: скачайте файл и добавьте события в «Календарь».</p>
        <div className="row">
          <NumField label="Замеры каждые" unit="дн." min={1} max={60} step={1} value={s.remindEveryDays} onChange={(v) => v && set({ remindEveryDays: Math.round(v) })} />
        </div>
        <button className="btn" style={{ marginTop: 8 }} onClick={() => downloadFile('kanon-napominaniya.ics', buildIcs(defaultReminders(today(), s.remindEveryDays)), 'text/calendar')}>
          Скачать напоминания (.ics)
        </button>
      </Card>

      <Card title="О приложении">
        <p className="tiny">
          «Канон» v{__APP_VERSION__}. 3D-модель — MakeHuman (CC0). Продукты — Open Food Facts (ODbL). Исследования — PubMed. Расчёты приблизительные; не медицинский совет.
        </p>
        <button
          className="btn btn-danger btn-small"
          onClick={async () => {
            if (!confirm('Удалить ВСЕ данные приложения на этом устройстве? Сначала сделайте бэкап.')) return;
            if (!confirm('Точно? Восстановить можно только из файла бэкапа.')) return;
            const db = getDb();
            await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
              for (const t of TABLES) await db.table(t).clear();
            });
            toast('Все данные удалены');
          }}
        >
          Удалить все данные
        </button>
      </Card>

      <Sheet open={!!restore} onClose={() => setRestore(null)} title="Восстановить из бэкапа?">
        {restore && (
          <div className="stack">
            <p className="tiny">
              Файл: {restore.name}, создан {fmtDate(restore.file.exportedAt)}. Содержит: замеров {restore.file.data.measurements?.length ?? 0}, подходов {restore.file.data.sets?.length ?? 0}, записей еды{' '}
              {restore.file.data.foods?.length ?? 0}, фото {restore.file.data.photos?.length ?? 0}.
            </p>
            <p className="banner banner-bad tiny">Текущие данные будут полностью заменены содержимым файла. Сейчас в приложении: замеров {fmt(ms.length, 0)}, подходов {fmt(sets.length, 0)}.</p>
            <button className="btn btn-danger btn-block" onClick={doRestore}>
              Заменить данные
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
