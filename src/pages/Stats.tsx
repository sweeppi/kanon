// «Статистика»: сводка за 7 / 30 / 90 дней против предыдущего такого же периода; сон и шаги — ввод и импорт.
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { getDb } from '../lib/data/db';
import { Card, Seg, Fold, ScreenHead, IconButton, NumField, fmt, fmtDate, useToast, pickFile } from '../components/ui';
import { LineChart } from '../components/Chart';
import { today } from '../lib/derive';
import { periodStats, longestStreak } from '../lib/stats';
import { useHashAction } from '../lib/useHashAction';
import { fmtSleep, mergeDaily, parseHealthText, type HealthImport } from '../lib/daily';

type Tab = 'overview' | 'health';
type Better = 'up' | 'down' | 'none';

function Row({ label, cur, prev, digits = 0, unit = '', better = 'none', format }: { label: string; cur: number | null; prev: number | null; digits?: number; unit?: string; better?: Better; format?: (v: number) => string }) {
  const show = (v: number | null) => (v === null ? '—' : format ? format(v) : `${fmt(v, digits)}${unit}`);
  const diff = cur !== null && prev !== null ? cur - prev : null;
  const tone = diff === null || diff === 0 || better === 'none' ? 'var(--muted)' : (better === 'up' ? diff > 0 : diff < 0) ? 'var(--good)' : 'var(--bad)';
  const diffText = diff === null ? 'нет данных для сравнения' : diff === 0 ? 'без изменений' : `${diff > 0 ? '+' : '−'}${format ? format(Math.abs(diff)) : `${fmt(Math.abs(diff), digits)}${unit}`} к прошлому периоду`;
  return (
    <div className="statrow">
      <div>
        <span>{label}</span>
        <small style={{ color: tone }}>{diffText}</small>
      </div>
      <b>{show(cur)}</b>
    </div>
  );
}

export function StatsPage() {
  const { ms, sets, foods, daily, water, d } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  useHashAction('stats', (p) => p.get('tab') === 'health' && setTab('health'));
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const { cur, prev } = useMemo(() => periodStats({ ms, sets, foods, daily, water }, +days, d.now), [ms, sets, foods, daily, water, days, d.now]);
  const best = useMemo(() => longestStreak([...ms.map((m) => m.date), ...foods.map((f) => f.date), ...sets.map((s) => s.start.slice(0, 10))]), [ms, foods, sets]);
  const inPeriod = (date: string) => date >= cur.from && date <= cur.to;
  const stepsSeries = daily.filter((x) => x.steps !== undefined && inPeriod(x.date)).map((x) => ({ date: x.date, value: x.steps! }));
  const sleepSeries = daily.filter((x) => x.sleepMin !== undefined && inPeriod(x.date)).map((x) => ({ date: x.date, value: Math.round((x.sleepMin! / 60) * 10) / 10 }));

  // ── ввод за день ──
  const [date, setDate] = useState(today());
  const row = daily.find((x) => x.date === date);
  const [steps, setSteps] = useState<number | undefined>(undefined);
  const [sleepH, setSleepH] = useState<number | undefined>(undefined);
  const [sleepM, setSleepM] = useState<number | undefined>(undefined);
  const saveDay = async () => {
    if (steps === undefined && sleepH === undefined && sleepM === undefined) return toast('Введите шаги или сон');
    const sleepMin = sleepH !== undefined || sleepM !== undefined ? (sleepH ?? 0) * 60 + (sleepM ?? 0) : undefined;
    await getDb().daily.put({ ...(row ?? { date }), ...(steps !== undefined ? { steps: Math.round(steps) } : {}), ...(sleepMin !== undefined ? { sleepMin } : {}) });
    setSteps(undefined);
    setSleepH(undefined);
    setSleepM(undefined);
    toast(`Сохранено за ${fmtDate(date)}`);
  };

  // ── импорт текста ──
  const [text, setText] = useState('');
  const parsed = useMemo<(HealthImport & { error: null }) | { error: string } | null>(() => {
    if (!text.trim()) return null;
    try {
      return { ...parseHealthText(text), error: null };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [text]);
  const fromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setText(t);
      else toast('Буфер обмена пуст');
    } catch {
      toast('Браузер не дал прочитать буфер — вставьте текст в поле вручную');
    }
  };
  const fromFile = async () => {
    const f = await pickFile('.csv,.tsv,.txt,text/csv,text/plain');
    if (f) setText(await f.text());
  };
  const doImport = async () => {
    if (!parsed || parsed.error !== null || !parsed.rows.length) return;
    await getDb().daily.bulkPut(mergeDaily(daily, parsed.rows));
    toast(`Импортировано дней: ${parsed.rows.length}`);
    setText('');
  };
  const recent = [...daily].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);

  return (
    <div>
      <ScreenHead title="Статистика" />
      <div className="subnav">
        <Seg<Tab>
          value={tab}
          onChange={setTab}
          label="Раздел"
          options={[
            ['overview', 'Обзор'],
            ['health', 'Сон и шаги'],
          ]}
        />
      </div>

      {tab === 'overview' && (
        <>
          <div className="subnav">
            <Seg<'7' | '30' | '90'>
              value={days}
              onChange={setDays}
              label="Период"
              options={[
                ['7', '7 дней'],
                ['30', '30 дней'],
                ['90', '90 дней'],
              ]}
            />
          </div>
          <p className="caption" style={{ margin: '0 0 12px' }}>
            {fmtDate(cur.from)} — {fmtDate(cur.to)} против {fmtDate(prev.from)} — {fmtDate(prev.to)}
          </p>

          <Card title="Дисциплина">
            <Row label="Дней с записями" cur={cur.activeDays} prev={prev.activeDays} better="up" />
            <Row label="Тренировок" cur={cur.workouts} prev={prev.workouts} better="up" />
            <div className="statrow">
              <div>
                <span>Серия сейчас</span>
                <small className="muted">рекорд — {best} дн.</small>
              </div>
              <b>{d.streak} дн.</b>
            </div>
          </Card>

          <Card title="Тело и питание">
            <Row label="Средний вес" cur={cur.weightAvg} prev={prev.weightAvg} digits={1} unit=" кг" />
            <Row label="Калории в день" cur={cur.kcalAvg} prev={prev.kcalAvg} unit=" ккал" />
            <Row label="Белок в день" cur={cur.proteinAvg} prev={prev.proteinAvg} unit=" г" better="up" />
            <Row label="Вода в день" cur={cur.waterAvgMl} prev={prev.waterAvgMl} unit=" мл" />
            <p className="caption" style={{ margin: '12px 0 0' }}>
              Средние считаются по дням, где есть записи: еда — {cur.foodDays} дн., взвешиваний — {cur.weighIns}.
            </p>
          </Card>

          <Card title="Нагрузка">
            <Row label="Рабочих подходов" cur={cur.workingSets} prev={prev.workingSets} better="up" />
            <Row label="Тоннаж" cur={cur.tonnage} prev={prev.tonnage} unit=" кг" better="up" />
          </Card>

          <Card title="Сон и шаги">
            <Row label="Шагов в день" cur={cur.stepsAvg} prev={prev.stepsAvg} better="up" />
            <Row label="Сон за ночь" cur={cur.sleepAvgMin} prev={prev.sleepAvgMin} better="up" format={(v) => fmtSleep(v)} />
            {cur.stepsDays === 0 && cur.sleepNights === 0 ? (
              <div className="actions">
                <button className="btn" onClick={() => setTab('health')}>
                  Внести сон и шаги
                </button>
              </div>
            ) : (
              <p className="caption" style={{ margin: '12px 0 0' }}>
                Дней с шагами — {cur.stepsDays}, ночей со сном — {cur.sleepNights}.
              </p>
            )}
          </Card>

          {stepsSeries.length >= 2 && (
            <Card title="Шаги по дням">
              <div style={{ marginTop: 12 }}>
                <LineChart series={[{ label: 'Шагов за день', points: stepsSeries, color: 'var(--accent)', dots: true }]} />
              </div>
            </Card>
          )}
          {sleepSeries.length >= 2 && (
            <Card title="Сон по ночам">
              <div style={{ marginTop: 12 }}>
                <LineChart unit="ч" target={7} series={[{ label: 'Часов сна', points: sleepSeries, color: 'var(--accent)', dots: true }]} />
              </div>
              <p className="caption" style={{ margin: '8px 0 0' }}>
                Пунктир — 7 часов, общий ориентир для взрослых.
              </p>
            </Card>
          )}
        </>
      )}

      {tab === 'health' && (
        <>
          <Card title="За день">
            <label className="field" style={{ marginTop: 12 }}>
              <span className="field-label">Дата (сон — по дню пробуждения)</span>
              <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
            </label>
            <div className="grid2" style={{ marginTop: 12 }}>
              <NumField label="Шаги" min={0} max={200000} step={100} value={steps} onChange={setSteps} placeholder={row?.steps !== undefined ? `было ${fmt(row.steps, 0)}` : ''} />
              <div />
              <NumField label="Сон, часы" min={0} max={18} step={1} value={sleepH} onChange={setSleepH} placeholder={row?.sleepMin !== undefined ? `было ${Math.floor(row.sleepMin / 60)}` : ''} />
              <NumField label="и минуты" min={0} max={59} step={5} value={sleepM} onChange={setSleepM} placeholder={row?.sleepMin !== undefined ? `${row.sleepMin % 60}` : ''} />
            </div>
            <div className="actions">
              <button className="btn btn-primary" onClick={saveDay}>
                Сохранить
              </button>
            </div>
          </Card>

          <Card title="Импорт из «Здоровья»">
            <p className="tiny muted" style={{ marginTop: 8 }}>
              Напрямую читать «Здоровье» веб-приложение не может. Быстрая команда на iPhone собирает шаги или сон в текст — вставьте его сюда.
            </p>
            <label className="field">
              <span className="field-label">Текст из Быстрой команды или таблицы</span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={'date;steps\n2026-11-12;8432\n2026-11-13;10250'} />
            </label>
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn" onClick={fromClipboard}>
                Вставить из буфера
              </button>
              <button className="btn" onClick={fromFile}>
                Из файла
              </button>
            </div>
            {parsed && parsed.error !== null && <p className="field-error">{parsed.error}</p>}
            {parsed && parsed.error === null && (
              <>
                <p style={{ margin: '12px 0 0' }}>
                  {parsed.mode === 'samples' ? 'Отрезки сна сложены по ночам. ' : ''}
                  Найдено дней: <b>{parsed.rows.length}</b>
                  {parsed.rows.length > 0 && (
                    <>
                      , с {fmtDate(parsed.rows[0].date)} по {fmtDate(parsed.rows.at(-1)!.date)}
                    </>
                  )}
                  . Уже записанные дни будут обновлены, дублей не появится.
                </p>
                {parsed.rows.at(-1) && (
                  <p className="caption" style={{ margin: '4px 0 0' }}>
                    Последний: {fmtDate(parsed.rows.at(-1)!.date)}
                    {parsed.rows.at(-1)!.steps !== undefined && `, шагов ${fmt(parsed.rows.at(-1)!.steps, 0)}`}
                    {parsed.rows.at(-1)!.sleepMin !== undefined && `, сон ${fmtSleep(parsed.rows.at(-1)!.sleepMin)}`}
                  </p>
                )}
                {parsed.errors.length > 0 && (
                  <p className="tiny" style={{ color: 'var(--warn)', margin: '8px 0 0' }}>
                    Пропущено строк: {parsed.errors.length}. {parsed.errors.slice(0, 3).join('; ')}
                  </p>
                )}
                <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} disabled={!parsed.rows.length} onClick={doImport}>
                  Импортировать
                </button>
              </>
            )}
          </Card>

          <Fold title="Как собрать Быструю команду для шагов">
            <ol className="steps-list">
              <li>Откройте приложение «Команды» и нажмите «+».</li>
              <li>
                Добавьте действие «Найти образцы здоровья». Тип — «Шаги». Фильтр: «Дата начала» — «за последние 30 дней». «Группировать по» — «День».
              </li>
              <li>Добавьте «Повторять с каждым» — на вход образцы из шага 2.</li>
              <li>
                Внутри повтора добавьте «Текст» и соберите строку: «Дата начала» элемента (формат даты — ISO 8601), точка с запятой, «Значение» элемента. Пример: <code>2026-11-13;8432</code>
              </li>
              <li>После повтора добавьте «Объединить текст», разделитель — «Новая строка».</li>
              <li>
                Добавьте «Текст»: первая строка <code>date;steps</code>, вторая — объединённый текст.
              </li>
              <li>Добавьте «Скопировать в буфер обмена». Запустите команду и разрешите доступ к «Здоровью».</li>
              <li>Вернитесь сюда и нажмите «Вставить из буфера».</li>
            </ol>
            <p className="caption" style={{ margin: 0 }}>
              Инструкция составлена по описаниям действий, на iPhone она не проверялась: названия пунктов в вашей версии iOS могут немного отличаться. Импорт понимает и другие записи даты, и текст без строки заголовка.
            </p>
          </Fold>

          <Fold title="Как собрать Быструю команду для сна">
            <ol className="steps-list">
              <li>Как для шагов, но тип — «Сон», без группировки по дням, период — «за последние 14 дней».</li>
              <li>
                Строка в «Тексте»: «Дата начала» (ISO 8601), точка с запятой, «Дата окончания» (ISO 8601), точка с запятой, «Значение». Пример: <code>2026-11-12T23:30:00+03:00;2026-11-13T07:05:00+03:00;Asleep</code>
              </li>
              <li>
                Первая строка итогового текста: <code>start;end;value</code>
              </li>
            </ol>
            <p className="caption" style={{ margin: 0 }}>
              Приложение само сложит отрезки по ночам, не посчитает дважды пересечения записей телефона и часов и отбросит строки «в кровати» и «не сплю». Ночь относится к дню пробуждения. На iPhone не проверялось.
            </p>
          </Fold>

          {recent.length > 0 && (
            <Card title="Последние записи">
              <ul className="entries" style={{ marginTop: 4 }}>
                {recent.map((x) => (
                  <li key={x.date} className="entry">
                    <div className="entry-main">
                      <b>{fmtDate(x.date)}</b>
                      <small className="muted">
                        {[x.steps !== undefined ? `шагов ${fmt(x.steps, 0)}` : null, x.sleepMin !== undefined ? `сон ${fmtSleep(x.sleepMin)}` : null].filter(Boolean).join(', ')}
                      </small>
                    </div>
                    <IconButton
                      icon="trash"
                      tone="danger"
                      label={`Удалить запись за ${fmtDate(x.date)}`}
                      onClick={async () => {
                        if (confirm(`Удалить сон и шаги за ${fmtDate(x.date)}?`)) await getDb().daily.delete(x.date);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
