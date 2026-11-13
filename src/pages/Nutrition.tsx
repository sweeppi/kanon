import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { getDb, type FoodEntry, type FoodTemplate } from '../lib/data/db';
import { Card, Stat, NumField, Fold, ScreenHead, IconButton, fmt, fmtDate, useToast, Sheet } from '../components/ui';
import { Icon } from '../components/icons';
import { Tape } from '../components/Tape';
import { LineChart } from '../components/Chart';
import { today } from '../lib/derive';
import { proteinPer100Rub } from '../lib/calc/nutrition';
import { searchOff, type OffProduct } from '../lib/off';
import { addDays, daysBetween } from '../lib/calc/trend';
import { estimateFiberSugar } from '../lib/calc/foodEstimate';
import { readTable, type Table, type Mapping } from '../lib/import/table';
import { detectFoods, parseFoodTable, foodKey, FOOD_IMPORT_FIELDS } from '../lib/import/foods';
import { MappingEditor } from '../components/ImportMapping';
import { pickFile } from '../components/ui';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { AskAiFood } from '../components/AskAiFood';
import { addWater } from '../lib/water';
import { useHashAction } from '../lib/useHashAction';

type Draft = Omit<FoodEntry, 'id' | 'date'>;
const EMPTY: Draft = { name: '', kcal: 0, protein: 0, fat: 0, carbs: 0 };

export function Nutrition() {
  const { d, foods, templates, settings, water } = useStore();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [asTemplate, setAsTemplate] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // ссылка-действие «#food?add=1» (Быстрая команда) сразу открывает добавление
  useHashAction('food', (p) => p.get('add') === '1' && setAddOpen(true));
  const [scanOpen, setScanOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  /** штрихкод со сканера: поиск откроется сразу с ним */
  const [scanned, setScanned] = useState('');
  const waterMl = water.get(date) ?? 0;
  const drink = (delta: number) => void getDb().water.put({ date, ml: addWater(waterMl, delta) });
  const t = d.targets;
  const day = d.totals.get(date);
  const entries = useMemo(() => foods.filter((f) => f.date === date), [foods, date]);
  const kcalSeries = useMemo(
    () => [...d.totals.values()].filter((x) => daysBetween(x.date, d.now) < 30 && x.kcal > 0).sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ date: x.date, value: x.kcal })),
    [d.totals, d.now],
  );

  const [imp, setImp] = useState<{ name: string; table: Table; mapping: Mapping } | null>(null);
  const [copyFrom, setCopyFrom] = useState(addDays(today(), -1));
  const estimate = estimateFiberSugar(draft.name, draft.carbs, draft.fiber, draft.sugar);

  /** Клетчатка и сахар: если не указаны — оцениваем по категории продукта (помечаем «≈»). */
  const withEstimates = (e: Draft): Draft => {
    const fs = estimateFiberSugar(e.name, e.carbs, e.fiber, e.sugar);
    return { ...e, fiber: fs.fiber, sugar: fs.sugar, fiberEstimated: fs.fiberEstimated || undefined, sugarEstimated: fs.sugarEstimated || undefined };
  };

  const add = async (e: Draft, source: FoodEntry['source'] = 'manual') => {
    if (!e.name.trim()) {
      toast('Назовите блюдо');
      return false;
    }
    if (!(e.kcal >= 0)) {
      toast('Проверьте калории');
      return false;
    }
    const full = withEstimates({ ...e, name: e.name.trim() });
    await getDb().foods.add({ ...full, date, source });
    if (asTemplate && source === 'manual') await getDb().templates.add({ ...full });
    toast(`Добавлено: ${e.name}`);
    return true;
  };

  const copyDay = async () => {
    const src = foods.filter((f) => f.date === copyFrom);
    if (!src.length) return toast(`За ${fmtDate(copyFrom)} записей нет`);
    await getDb().foods.bulkAdd(src.map(({ id: _id, ...f }) => ({ ...f, date, source: 'copy' as const })));
    toast(`Скопировано ${src.length} записей из ${fmtDate(copyFrom)}`);
  };

  const parsedImport = useMemo(() => {
    if (!imp) return null;
    try {
      const r = parseFoodTable(imp.table, imp.mapping);
      const existing = new Set(foods.map(foodKey));
      const fresh = r.rows.filter((x) => !existing.has(foodKey(x)));
      return { ...r, fresh, days: new Set(r.rows.map((x) => x.date)).size, error: null as string | null };
    } catch (e) {
      return { rows: [], fresh: [], errors: [] as string[], days: 0, error: (e as Error).message };
    }
  }, [imp, foods]);
  const startImport = async () => {
    const f = await pickFile('.csv,.tsv,.txt,text/csv');
    if (!f) return;
    try {
      const table = readTable(await f.text());
      setImp({ name: f.name, table, mapping: detectFoods(table) });
    } catch (e) {
      toast(`Ошибка чтения: ${(e as Error).message}`);
    }
  };
  const confirmImport = async () => {
    if (!parsedImport?.fresh.length) return;
    await getDb().foods.bulkAdd(parsedImport.fresh);
    toast(`Импортировано записей: ${parsedImport.fresh.length}`);
    setImp(null);
  };

  const remaining = t ? Math.round(t.kcal - (day?.kcal ?? 0)) : null;
  const isToday = date === today();

  return (
    <div>
      <ScreenHead
        title="Питание"
        action={
          <button className="btn btn-small btn-primary" onClick={() => setAddOpen(true)}>
            <Icon name="plus" size={18} />
            Добавить
          </button>
        }
      />
      <div className="daynav">
        <IconButton icon="back" label="Предыдущий день" onClick={() => setDate(addDays(date, -1))} />
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} aria-label="Дата дневника" />
        <IconButton icon="chevron" label="Следующий день" disabled={date >= today()} onClick={() => setDate(addDays(date, 1))} />
      </div>

      <Card>
        {!t || remaining === null ? (
          <div className="empty">
            <p>Чтобы посчитать цель по калориям и белку, нужен ваш вес.</p>
            <a className="btn btn-primary" href="#measure">
              Внести вес
            </a>
          </div>
        ) : (
          <>
            <div className="figure" style={{ marginTop: 0 }}>
              <b>{fmt(Math.abs(remaining), 0)}</b>
              <span>{remaining >= 0 ? (isToday ? 'ккал осталось на сегодня' : 'ккал оставалось') : 'ккал сверх цели'}</span>
            </div>
            {(
              [
                ['Калории', day?.kcal ?? 0, t.kcal, ''],
                ['Белок', day?.protein ?? 0, t.protein, ' г'],
                ['Жиры', day?.fat ?? 0, t.fat, ' г'],
                ['Углеводы', day?.carbs ?? 0, t.carbs, ' г'],
              ] as const
            ).map(([l, v, g, u]) => (
              <Tape key={l} label={l} value={v} max={g} caption={`${fmt(v, 0)} из ${fmt(g, 0)}${u}`} ariaText={`${l}: ${fmt(v, 0)} из ${fmt(g, 0)}${u}`} />
            ))}
            <p className="caption" style={{ margin: '16px 0 0' }}>
              Клетчатка {entries.some((e) => e.fiberEstimated) ? '≈ ' : ''}
              {fmt(day?.fiber ?? 0, 0)} г (ориентир 25–29), сахар {entries.some((e) => e.sugarEstimated) ? '≈ ' : ''}
              {fmt(day?.sugar ?? 0, 0)} г, стоимость {fmt(day?.priceRub ?? 0, 0)} ₽
              {day && day.priceRub > 0 && `, белок на 100 ₽: ${fmt(proteinPer100Rub(day.protein, day.priceRub), 1)} г`}
            </p>
          </>
        )}
      </Card>

      <Card title="Вода">
        <div style={{ marginTop: 12 }}>
          <Tape label={isToday ? 'Сегодня' : fmtDate(date)} value={waterMl} max={settings.waterGoalMl} caption={`${fmt(waterMl, 0)} из ${fmt(settings.waterGoalMl, 0)} мл`} ariaText={`Вода: ${fmt(waterMl, 0)} из ${fmt(settings.waterGoalMl, 0)} миллилитров`} />
        </div>
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => drink(250)}>
            + 250 мл
          </button>
          <button className="btn" onClick={() => drink(500)}>
            + 500 мл
          </button>
          <button className="btn" disabled={waterMl === 0} onClick={() => drink(-250)} aria-label="Убрать 250 миллилитров">
            − 250
          </button>
        </div>
        <p className="caption" style={{ margin: '12px 0 0' }}>
          Цель задаёте вы в настройках. Единой нормы нет: потребность зависит от веса, жары и нагрузки.
        </p>
      </Card>

      <Card title={isToday ? 'Съедено сегодня' : `Съедено ${fmtDate(date)}`}>
        {entries.length === 0 ? (
          <div className="empty">
            <p>Записей за этот день нет.</p>
            <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
              Добавить блюдо
            </button>
          </div>
        ) : (
          <ul className="entries" style={{ marginTop: 4 }}>
            {entries.map((e) => (
              <li key={e.id} className="entry">
                <div className="entry-main">
                  <b>
                    {e.name}
                    {e.grams ? <span className="muted" style={{ fontWeight: 400 }}>, {e.grams} г</span> : null}
                  </b>
                  <small className="muted">
                    {e.kcal} ккал, Б {fmt(e.protein, 0)} Ж {fmt(e.fat, 0)} У {fmt(e.carbs, 0)}
                    {e.source === 'ai' && <span style={{ color: 'var(--warn)' }}> (оценка ИИ)</span>}
                    {e.fiber != null && `, клетчатка ${e.fiberEstimated ? '≈' : ''}${fmt(e.fiber, 0)}`}
                    {e.sugar != null && `, сахар ${e.sugarEstimated ? '≈' : ''}${fmt(e.sugar, 0)}`}
                    {e.priceRub ? `, ${e.priceRub} ₽ (${fmt(proteinPer100Rub(e.protein, e.priceRub), 1)} г белка на 100 ₽)` : ''}
                  </small>
                </div>
                <IconButton
                  icon="trash"
                  tone="danger"
                  label={`Удалить ${e.name}`}
                  onClick={async () => {
                    await getDb().foods.delete(e.id!);
                    toast('Запись удалена');
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Мои шаблоны">
        {templates.length === 0 ? (
          <p className="muted" style={{ margin: '8px 0 0' }}>
            Отметьте «Сохранить как шаблон» при добавлении блюда — частые блюда будут добавляться в одно касание.
          </p>
        ) : (
          <ul className="entries" style={{ marginTop: 4 }}>
            {templates.map((tp: FoodTemplate) => (
              <li key={tp.id} className="entry">
                <div className="entry-main">
                  <b>{tp.name}</b>
                  <small className="muted">
                    {tp.kcal} ккал, белок {fmt(tp.protein, 0)} г{tp.priceRub ? `, ${tp.priceRub} ₽` : ''}
                  </small>
                </div>
                <IconButton icon="plus" tone="primary" label={`Добавить ${tp.name} в дневник`} onClick={() => void add({ ...tp }, 'template')} />
                <IconButton
                  icon="trash"
                  tone="danger"
                  label={`Удалить шаблон ${tp.name}`}
                  onClick={async () => {
                    if (confirm(`Удалить шаблон «${tp.name}»?`)) await getDb().templates.delete(tp.id!);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {kcalSeries.length >= 2 && t && (
        <Card title="Калории за 30 дней">
          <div style={{ marginTop: 12 }}>
            <LineChart unit="ккал" target={t.kcal} series={[{ label: 'Ккал за день', points: kcalSeries, color: 'var(--accent)', dots: true }]} />
          </div>
        </Card>
      )}

      <div className="section-gap">
        {t && (
          <Fold title="Цели и как они посчитаны">
            <div className="grid2">
              <Stat label="Калории" value={fmt(t.kcal, 0)} sub={t.kcalOverridden ? 'задано вручную' : t.cutting ? `сушка, −${settings.cutRatePct} % в неделю` : 'поддержание'} />
              <Stat label="Белок, г" value={fmt(t.protein, 0)} sub={t.proteinOverridden ? 'задано вручную' : `диапазон ${fmt(t.proteinRange[0], 0)}–${fmt(t.proteinRange[1], 0)}`} />
              <Stat label="Жиры, г" value={fmt(t.fat, 0)} />
              <Stat label="Углеводы, г" value={fmt(t.carbs, 0)} />
            </div>
            <p className="tiny muted" style={{ marginTop: 12 }}>
              BMR {fmt(t.bmr, 0)} ккал ({t.bmrFormula}). TDEE {fmt(t.tdee, 0)} ккал —{' '}
              {t.tdeeSource === 'adaptive'
                ? `адаптивный: ${t.adaptive!.loggedDays} дней записей за ${t.adaptive!.days} дн., тренд ${fmt(t.adaptive!.trendKgPerWeek, 2)} кг/нед (≈ 7700 ккал на кг — приближение)`
                : t.activity
                  ? `по активности: база ${fmt(t.activity.base, 0)} + шаги ${fmt(t.activity.walking, 0)} + тренировки ${fmt(t.activity.training, 0)} + работа стоя ${fmt(t.activity.standing, 0)} (≈ ×${fmt(t.activity.factor, 2)} от BMR). Адаптивный появится после 2–3 недель взвешиваний и записей еды`
                  : `по формуле × активность ${settings.activityFactor}. Адаптивный появится после 2–3 недель взвешиваний и записей еды`}
              . Белок: {t.proteinBasis} (Morton 2018; Helms 2014). Цели можно переопределить в настройках.
            </p>
            {d.forecast && (
              <p className="tiny" style={{ margin: 0 }}>
                {d.forecast.date ? (
                  <>
                    Прогноз: <b>{settings.goalWeightKg} кг к {fmtDate(d.forecast.date)}</b> ({fmt(d.forecast.kgPerWeek, 2)} кг/нед по факту).
                  </>
                ) : (
                  <>Тренд ({fmt(d.forecast.kgPerWeek, 2)} кг/нед) не ведёт к цели {settings.goalWeightKg} кг.</>
                )}
              </p>
            )}
          </Fold>
        )}

        <Fold title="Повторить день или импортировать">
          <label className="field">
            <span className="field-label">Скопировать записи из дня</span>
            <input type="date" value={copyFrom} max={today()} onChange={(e) => setCopyFrom(e.target.value)} />
          </label>
          <div className="actions">
            <button className="btn" onClick={copyDay} disabled={copyFrom === date}>
              Повторить в {fmtDate(date)}
            </button>
            <button className="btn" onClick={startImport}>
              Импорт CSV
            </button>
          </div>
          <p className="caption" style={{ margin: '12px 0 0' }}>
            Импорт понимает MyFitnessPal, Cronometer, FatSecret или свою таблицу.
          </p>
        </Fold>
      </div>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title={`Добавить в ${fmtDate(date)}`}>
        <div className="stack">
          <div className="actions" style={{ marginTop: 0 }}>
            <button
              className="btn"
              onClick={() => {
                setAddOpen(false);
                setScanOpen(true);
              }}
            >
              Штрихкод
            </button>
            <button
              className="btn"
              onClick={() => {
                setAddOpen(false);
                setScanned('');
                setSearchOpen(true);
              }}
            >
              Поиск
            </button>
            <button
              className="btn"
              onClick={() => {
                setAddOpen(false);
                setAiOpen(true);
              }}
            >
              Спросить ИИ
            </button>
          </div>
          <label className="field">
            <span className="field-label">Блюдо</span>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Курица с рисом" />
          </label>
          <div className="grid2">
            <NumField label="Калории" unit="ккал" min={0} max={5000} value={draft.kcal || undefined} onChange={(v) => setDraft({ ...draft, kcal: v ?? 0 })} />
            <NumField label="Белок" unit="г" min={0} max={500} value={draft.protein || undefined} onChange={(v) => setDraft({ ...draft, protein: v ?? 0 })} />
            <NumField label="Жиры" unit="г" min={0} max={500} value={draft.fat || undefined} onChange={(v) => setDraft({ ...draft, fat: v ?? 0 })} />
            <NumField label="Углеводы" unit="г" min={0} max={1000} value={draft.carbs || undefined} onChange={(v) => setDraft({ ...draft, carbs: v ?? 0 })} />
          </div>
          {!draft.kcal && draft.protein + draft.fat + draft.carbs > 0 && (
            <button className="btn btn-block" onClick={() => setDraft({ ...draft, kcal: Math.round(draft.protein * 4 + draft.fat * 9 + draft.carbs * 4) })}>
              Подставить {Math.round(draft.protein * 4 + draft.fat * 9 + draft.carbs * 4)} ккал по БЖУ
            </button>
          )}
          <details>
            <summary>Клетчатка, сахар, цена, вес порции</summary>
            <div className="grid2">
              <NumField label="Клетчатка" unit="г" min={0} max={200} value={draft.fiber} placeholder={draft.carbs ? `≈ ${fmt(estimate.fiber, 1)} авто` : 'авто'} onChange={(v) => setDraft({ ...draft, fiber: v })} />
              <NumField label="Сахар" unit="г" min={0} max={500} value={draft.sugar} placeholder={draft.carbs ? `≈ ${fmt(estimate.sugar, 1)} авто` : 'авто'} onChange={(v) => setDraft({ ...draft, sugar: v })} />
              <NumField label="Цена" unit="₽" min={0} max={100000} value={draft.priceRub} onChange={(v) => setDraft({ ...draft, priceRub: v })} />
              <NumField label="Вес порции" unit="г" min={0} max={5000} value={draft.grams} onChange={(v) => setDraft({ ...draft, grams: v })} />
            </div>
            <p className="caption">
              Клетчатку и сахар можно не заполнять: оценим по углеводам и типу продукта («{estimate.category}») — в дневнике будет пометка «≈».
            </p>
          </details>
          <label className="check">
            <input type="checkbox" checked={asTemplate} onChange={(e) => setAsTemplate(e.target.checked)} /> Сохранить как шаблон
          </label>
          <button
            className="btn btn-primary btn-block"
            onClick={async () => {
              if (await add(draft)) {
                setDraft(EMPTY);
                setAddOpen(false);
              }
            }}
          >
            Добавить
          </button>
        </div>
      </Sheet>

      <Sheet open={!!imp} onClose={() => setImp(null)} title="Импорт питания">
        {imp && parsedImport && (
          <div className="stack">
            <p className="tiny">
              Файл <b>{imp.name}</b>, строк: {imp.table.rows.length}. Колонки распознаются автоматически — проверьте сопоставление. Клетчатка и сахар, если их нет в файле, будут оценены («≈»).
            </p>
            <details open={!!parsedImport.error}>
              <summary>Сопоставление колонок</summary>
              <MappingEditor table={imp.table} fields={FOOD_IMPORT_FIELDS} mapping={imp.mapping} onChange={(m) => setImp({ ...imp, mapping: m })} />
            </details>
            {parsedImport.error ? (
              <p className="field-error">{parsedImport.error}</p>
            ) : (
              <p>
                Записей: <b>{parsedImport.rows.length}</b> за {parsedImport.days} дн. Новых: <b style={{ color: 'var(--good)' }}>{parsedImport.fresh.length}</b>, уже есть: {parsedImport.rows.length - parsedImport.fresh.length}.
              </p>
            )}
            {parsedImport.rows[0] && (
              <p className="tiny muted">
                Пример: {fmtDate(parsedImport.rows[0].date)}, {parsedImport.rows[0].name}, {parsedImport.rows[0].kcal} ккал, Б {fmt(parsedImport.rows[0].protein, 0)}
              </p>
            )}
            {parsedImport.errors.length > 0 && <p className="tiny" style={{ color: 'var(--warn)' }}>Пропущено строк: {parsedImport.errors.length}. {parsedImport.errors.slice(0, 3).join('; ')}</p>}
            <button className="btn btn-primary btn-block" disabled={!parsedImport.fresh.length} onClick={confirmImport}>
              {parsedImport.fresh.length ? `Добавить ${parsedImport.fresh.length}` : 'Нового нет'}
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={scanOpen} onClose={() => setScanOpen(false)} title="Штрихкод">
        {scanOpen && (
          <BarcodeScanner
            onDetect={(code) => {
              setScanOpen(false);
              setScanned(code);
              setSearchOpen(true);
            }}
          />
        )}
      </Sheet>

      <Sheet open={aiOpen} onClose={() => setAiOpen(false)} title="Спросить ИИ">
        <AskAiFood
          onAdd={async (items) => {
            await getDb().foods.bulkAdd(items.map(({ warnings: _w, ...it }) => ({ ...withEstimates(it), date, source: 'ai' as const })));
            toast(`Добавлено записей: ${items.length}`);
            setAiOpen(false);
          }}
        />
      </Sheet>

      <OffSearch key={scanned} initial={scanned} open={searchOpen} onClose={() => setSearchOpen(false)} onAdd={async (e) => void (await add(e, 'off'))} />
    </div>
  );
}

function OffSearch({ open, onClose, onAdd, initial = '' }: { open: boolean; onClose: () => void; onAdd: (e: Draft) => Promise<void>; initial?: string }) {
  const [q, setQ] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<OffProduct[]>([]);
  const [pick, setPick] = useState<OffProduct | null>(null);
  const [grams, setGrams] = useState<number | undefined>(100);
  const [price, setPrice] = useState<number | undefined>(undefined);
  const run = async (query = q) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await searchOff(query);
      setRes(r);
      // со сканера приходит один товар — сразу открываем его, чтобы осталось указать порцию
      if (r.length === 1 && query === initial && initial) setPick(r[0]);
      if (!r.length) setErr(initial && query === initial ? `Штрихкод ${query} не найден в Open Food Facts. Попробуйте поиск по названию или введите блюдо вручную.` : 'Ничего не найдено. Попробуйте другое название или штрихкод.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const k = (grams ?? 0) / 100;
  // пришли со сканера: ищем сразу, один раз при открытии
  useEffect(() => {
    if (open && initial) void run(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);
  return (
    <Sheet open={open} onClose={onClose} title="Поиск в Open Food Facts">
      {!navigator.onLine && <p className="banner banner-warn tiny">Нет сети: поиск недоступен, используйте ручной ввод.</p>}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название или штрихкод" style={{ flex: 1 }} aria-label="Запрос" />
        <button className="btn btn-primary" disabled={busy || !q.trim()}>
          {busy ? 'Ищу' : 'Найти'}
        </button>
      </form>
      {err && <p className="field-error">{err}</p>}
      {pick ? (
        <div className="stack" style={{ marginTop: 10 }}>
          <b>{pick.name}</b>
          <span className="tiny muted">
            На 100 г: {pick.per100.kcal} ккал, Б {fmt(pick.per100.protein, 1)} Ж {fmt(pick.per100.fat, 1)} У {fmt(pick.per100.carbs, 1)}
          </span>
          <div className="grid2">
            <NumField label="Порция" unit="г" min={1} max={3000} value={grams} onChange={setGrams} />
            <NumField label="Цена порции" unit="₽" min={0} max={100000} value={price} onChange={setPrice} />
          </div>
          <button
            className="btn btn-primary btn-block"
            disabled={!grams}
            onClick={async () => {
              await onAdd({
                name: pick.brand ? `${pick.name} (${pick.brand})` : pick.name,
                kcal: Math.round(pick.per100.kcal * k),
                protein: +(pick.per100.protein * k).toFixed(1),
                fat: +(pick.per100.fat * k).toFixed(1),
                carbs: +(pick.per100.carbs * k).toFixed(1),
                fiber: pick.per100.fiber !== undefined ? +(pick.per100.fiber * k).toFixed(1) : undefined,
                sugar: pick.per100.sugar !== undefined ? +(pick.per100.sugar * k).toFixed(1) : undefined,
                grams,
                priceRub: price,
              });
              setPick(null);
              onClose();
            }}
          >
            Добавить {grams} г
          </button>
          <button className="btn btn-block" onClick={() => setPick(null)}>
            Назад к результатам
          </button>
        </div>
      ) : (
        <ul className="list" style={{ marginTop: 8 }}>
          {res.map((p) => (
            <li key={p.code + p.name}>
              <button className="btn btn-block" style={{ justifyContent: 'space-between', textAlign: 'left' }} onClick={() => setPick(p)}>
                <span>
                  {p.name}
                  {p.brand && <span className="muted">, {p.brand}</span>}
                </span>
                <span className="tiny muted">
                  {p.per100.kcal} ккал, Б {fmt(p.per100.protein, 0)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="tiny muted" style={{ marginTop: 10 }}>
        Данные: <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a>, лицензия{' '}
        <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL</a>. Значения вносят пользователи — проверяйте по этикетке.
      </p>
    </Sheet>
  );
}
