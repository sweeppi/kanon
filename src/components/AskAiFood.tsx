// «Спросить ИИ» про еду: запрос копируется в буфер, пользователь сам вставляет его в свой чат
// (и при желании прикладывает фото), ответ вставляет сюда — приложение разбирает его в позиции дневника.
import { useMemo, useState } from 'react';
import { buildFoodPrompt, parseAiFood, type AiFoodItem } from '../lib/aiFood';
import { fmt, useToast } from './ui';
import { Icon } from './icons';

export function AskAiFood({ onAdd }: { onAdd: (items: AiFoodItem[]) => Promise<void> }) {
  const toast = useToast();
  const [desc, setDesc] = useState('');
  const [answer, setAnswer] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => (answer.trim() ? parseAiFood(answer) : null), [answer]);

  const copy = async () => {
    const text = buildFoodPrompt(desc);
    try {
      await navigator.clipboard.writeText(text);
      setShown(null);
      toast('Запрос скопирован. Вставьте его в чат с ИИ');
    } catch {
      setShown(text); // буфер недоступен — показываем текст для ручного копирования
    }
  };
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setAnswer(t);
      else toast('Буфер обмена пуст');
    } catch {
      toast('Браузер не дал прочитать буфер — вставьте текст в поле вручную');
    }
  };

  return (
    <div className="stack">
      <p className="tiny muted" style={{ margin: 0 }}>
        Приложение само в ИИ не обращается и ничего не отправляет. Вы копируете запрос, вставляете его в свой чат (Claude, Gemini и др.), при желании прикладываете фото тарелки и возвращаете сюда ответ.
      </p>

      <h3 className="group-title" style={{ marginBottom: 0 }}>
        1. Что вы съели
      </h3>
      <label className="field">
        <span className="field-label">Описание (можно оставить пустым, если приложите фото)</span>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} style={{ minHeight: 88 }} placeholder="Тарелка борща со сметаной, два куска чёрного хлеба" />
      </label>
      <button className="btn btn-primary btn-block" onClick={copy}>
        Скопировать запрос
      </button>
      {shown && (
        <>
          <p className="tiny" style={{ color: 'var(--warn)', margin: 0 }}>
            Буфер обмена недоступен — выделите текст и скопируйте вручную:
          </p>
          <textarea readOnly value={shown} rows={8} onFocus={(e) => e.currentTarget.select()} aria-label="Текст запроса" />
        </>
      )}

      <h3 className="group-title" style={{ marginBottom: 0 }}>
        2. Ответ ИИ
      </h3>
      <label className="field">
        <span className="field-label">Вставьте ответ целиком</span>
        <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} style={{ minHeight: 100 }} placeholder='{"items":[…]}' />
      </label>
      <button className="btn btn-block" onClick={paste}>
        Вставить из буфера
      </button>

      {parsed && (
        <>
          {parsed.errors.map((e) => (
            <p key={e} className="field-error" style={{ margin: 0 }}>
              {e}
            </p>
          ))}
          {parsed.items.length > 0 && (
            <ul className="entries">
              {parsed.items.map((it, i) => (
                <li key={`${it.name}-${i}`} className="entry">
                  <div className="entry-main">
                    <b>
                      {it.name}
                      {it.grams ? <span className="muted" style={{ fontWeight: 400 }}>, {it.grams} г</span> : null}
                    </b>
                    <small className="muted">
                      ≈ {it.kcal} ккал, Б {fmt(it.protein, 0)} Ж {fmt(it.fat, 0)} У {fmt(it.carbs, 0)}
                    </small>
                    {it.warnings.map((w) => (
                      <small key={w} style={{ color: 'var(--warn)' }}>
                        Проверьте: {w}
                      </small>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {parsed.note && <p className="caption" style={{ margin: 0 }}>Пояснение ИИ: {parsed.note}</p>}
          {parsed.items.length > 0 && (
            <>
              <p className="note note-warn" style={{ margin: 0 }}>
                <Icon name="warning" size={18} />
                <span>Это оценка языковой модели, а не измерение: ошибка в десятки процентов — обычное дело. В дневнике записи будут помечены «оценка ИИ».</span>
              </p>
              <button
                className="btn btn-primary btn-block"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onAdd(parsed.items);
                    setAnswer('');
                    setDesc('');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Добавить в дневник: {parsed.items.length}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
