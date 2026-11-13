import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { getDb, TABLES, type Settings } from '../lib/data/db';
import { exportBackup, importBackup, validateBackup, canonical, measurementsCsv, workoutsCsv, downloadFile, BackupError, type BackupFile } from '../lib/data/backup';
import { Card, NumField, Seg, Fold, ScreenHead, useToast, fmtDate, pickFile, Sheet, fmt } from '../components/ui';
import { Icon } from '../components/icons';
import { buildIcs, defaultReminders } from '../lib/ics';
import { today } from '../lib/derive';
import { isIOS, isStandalone } from '../lib/platform';
import { FIELDS } from '../lib/measureMeta';
import { ActivityEditor, HealthEditor } from '../components/ProfileEditors';
import { recentStepsAvg } from '../lib/stats';
import { actionLinks } from '../lib/links';

export function SettingsPage() {
  const { settings: s, setSettings, ms, sets, d, daily } = useStore();
  const toast = useToast();
  const set = (p: Partial<Settings>) => void setSettings(p);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');
  const [restore, setRestore] = useState<{ file: BackupFile; name: string } | null>(null);
  const [verify, setVerify] = useState<{ ok: boolean; text: string } | null>(null);

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
      setVerify({ ok, text: ok ? 'Восстановлено. Проверка: данные полностью совпадают с файлом бэкапа.' : 'Восстановлено, но проверка нашла расхождения — сохраните оба файла и сообщите об ошибке.' });
      setRestore(null);
      // помним, что у пользователя есть этот бэкап (после сверки, чтобы не влиять на проверку)
      await setSettings({ lastBackupAt: restore.file.exportedAt });
    } catch (e) {
      toast(`Восстановление не удалось, данные не изменены: ${(e as Error).message}`);
    }
  };

  return (
    <div>
      <ScreenHead title="Настройки" />

      <Card title="Бэкап">
        <p className="tiny muted" style={{ marginTop: 8 }}>
          Все данные хранятся только на этом устройстве. Последний бэкап: <span style={{ color: 'var(--text)' }}>{s.lastBackupAt ? fmtDate(s.lastBackupAt) : 'не было'}</span>. Делайте бэкап раз в неделю и храните файл в «Файлах» или iCloud Drive.
        </p>
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={doBackup}>
            Сохранить бэкап
          </button>
          <button className="btn" onClick={chooseRestore}>
            Восстановить
          </button>
        </div>
        {verify && (
          <p className={`note ${verify.ok ? 'note-good' : 'note-warn'}`} style={{ margin: '12px 0 0' }}>
            <Icon name={verify.ok ? 'check' : 'warning'} size={18} />
            <span>{verify.text}</span>
          </p>
        )}
      </Card>

      <div className="section-gap">
        <Fold title="Профиль">
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
          </div>
          <div className="actions">
            <button className="btn" onClick={() => set({ onboarded: false })}>
              Пройти настройку заново
            </button>
          </div>
        </Fold>

        <Fold title="Активность">
          <ActivityEditor s={s} set={set} weightKg={d.values.weight} stepsAvg={recentStepsAvg(daily, d.now)} />
        </Fold>

        <Fold title="Цели">
          <div className="grid2">
            <NumField label="Целевой вес" unit="кг" min={30} max={250} value={s.goalWeightKg || undefined} onChange={(v) => set({ goalWeightKg: v ?? 0 })} hint="Пусто — без цели по весу" />
            <NumField label="Целевой % жира" unit="%" min={4} max={40} value={s.goalBodyFat} onChange={(v) => v && set({ goalBodyFat: v })} />
            <NumField label="Темп сушки" unit="%/нед" min={0.25} max={1.5} step={0.05} value={s.cutRatePct} onChange={(v) => v && set({ cutRatePct: v })} hint="Рекомендуют 0,5–1 % (Helms 2014)" />
            <div />
            <NumField label="Калории вручную" unit="ккал" min={800} max={6000} step={10} value={s.kcalOverride} onChange={(v) => set({ kcalOverride: v ?? null })} hint="Пусто — считается автоматически" />
            <NumField label="Белок вручную" unit="г" min={30} max={400} step={1} value={s.proteinOverride} onChange={(v) => set({ proteinOverride: v ?? null })} hint="Пусто — по Morton и Helms" />
            <NumField label="Вода в день" unit="мл" min={500} max={8000} step={50} value={s.waterGoalMl} onChange={(v) => v && set({ waterGoalMl: Math.round(v) })} hint="Ваша цель; единой нормы нет" />
          </div>
          <details style={{ marginTop: 12 }}>
            <summary>Целевые обхваты для режима «Цель» (необязательно)</summary>
            <p className="caption">По умолчанию цель — эстетический итог прогноза. Здесь можно задать свои обхваты.</p>
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
        </Fold>

        <Fold title="Здоровье и ограничения">
          <HealthEditor s={s} set={set} />
        </Fold>

        <Fold title="Оформление">
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
        </Fold>

        <Fold title="Экспорт в CSV">
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn" disabled={!ms.length} onClick={() => downloadFile(`kanon-zamery-${today()}.csv`, measurementsCsv(ms), 'text/csv')}>
              Замеры
            </button>
            <button className="btn" disabled={!sets.length} onClick={() => downloadFile(`kanon-trenirovki-${today()}.csv`, workoutsCsv(sets), 'text/csv')}>
              Тренировки
            </button>
          </div>
        </Fold>

        <Fold title="Напоминания">
          <p className="caption" style={{ marginTop: 0 }}>
            Push-уведомления на iOS требуют сервер, поэтому используем календарь: скачайте файл и добавьте события в «Календарь».
          </p>
          <NumField label="Замеры каждые" unit="дн." min={1} max={60} step={1} value={s.remindEveryDays} onChange={(v) => v && set({ remindEveryDays: Math.round(v) })} />
          <div className="actions">
            <button className="btn" onClick={() => downloadFile('kanon-napominaniya.ics', buildIcs(defaultReminders(today(), s.remindEveryDays)), 'text/calendar')}>
              Скачать напоминания (.ics)
            </button>
          </div>
        </Fold>

        <Fold title="Быстрые команды и Siri">
          <p className="caption" style={{ marginTop: 0 }}>
            Эти адреса открывают приложение сразу на нужном действии. В «Командах» iPhone создайте команду с действием «Открыть URL», вставьте адрес и назовите её фразой — Siri будет запускать её по голосу.
          </p>
          <ul className="entries">
            {actionLinks(location.href).map((l) => (
              <li key={l.id} className="entry">
                <div className="entry-main">
                  <b>{l.title}</b>
                  <small className="muted">Фраза: «{l.phrase}»</small>
                  <small className="muted" style={{ overflowWrap: 'anywhere' }}>
                    {l.url}
                  </small>
                </div>
                <button
                  className="btn btn-small"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(l.url);
                      toast('Адрес скопирован');
                    } catch {
                      toast('Браузер не дал скопировать — выделите адрес вручную');
                    }
                  }}
                >
                  Копировать
                </button>
              </li>
            ))}
          </ul>
          <p className="note note-warn" style={{ margin: '12px 0 0' }}>
            <Icon name="warning" size={18} />
            <span>
              На iPhone не проверено. Команда может открыть адрес в Safari, а не в установленном приложении, а у них раздельные данные: в Safari вы увидите пустой «Канон». Сначала проверьте на команде «Открыть Канон»: если открылось не приложение с вашими данными — не пользуйтесь этим способом.
            </span>
          </p>
        </Fold>

        <Fold title="Хранилище и установка">
          <div className="kv">
            <span>Постоянное хранилище</span>
            <span>{persisted === null ? 'неизвестно' : persisted ? 'разрешено' : 'не разрешено'}</span>
          </div>
          <div className="kv">
            <span>Занято</span>
            <span>{usage || '—'}</span>
          </div>
          <div className="kv">
            <span>Режим</span>
            <span>{isStandalone() ? 'установлено как приложение' : 'вкладка браузера'}</span>
          </div>
          {!persisted && (
            <div className="actions">
              <button
                className="btn"
                onClick={async () => {
                  const r = await navigator.storage?.persist?.();
                  setPersisted(!!r);
                  toast(r ? 'Браузер обещал не удалять данные' : 'Браузер отказал — установите приложение на экран «Домой»');
                }}
              >
                Запросить постоянное хранилище
              </button>
            </div>
          )}
          <p className="caption" style={{ margin: '12px 0 0' }}>
            Важно для iPhone: Safari может стереть данные сайта, который не установлен на экран «Домой» и не открывался около 7 дней. Установка: {isIOS() ? '' : 'на iPhone в Safari — '}«Поделиться», затем «На экран „Домой“». Даже после установки делайте бэкапы: удаление иконки удаляет и данные.
          </p>
        </Fold>

        <Fold title="О приложении">
          <p className="tiny muted" style={{ marginTop: 0 }}>
            «Канон» v{__APP_VERSION__}. 3D-модель — MakeHuman (CC0). Продукты — Open Food Facts (ODbL). Исследования — PubMed. Шрифт Forum (SIL OFL). Расчёты приблизительные; не медицинский совет.
          </p>
          <button
            className="btn btn-danger"
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
        </Fold>
      </div>

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
