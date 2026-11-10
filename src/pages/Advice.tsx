import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { evaluateAdvice, EVIDENCE_RU, pubmedUrl, doiUrl, knowledge } from '../lib/advice/engine';
import { Card, Seg, Empty, useToast } from '../components/ui';
import { buildAiContext } from '../lib/aiContext';
import { ReportCard } from '../components/ReportCard';

export function AdvicePage() {
  const store = useStore();
  const { d } = store;
  const toast = useToast();
  const advice = useMemo(() => evaluateAdvice(d.adviceCtx), [d.adviceCtx]);
  const research = advice.filter((a) => a.kind === 'research');
  const heur = advice.filter((a) => a.kind === 'heuristic');
  const [period, setPeriod] = useState<'14' | '30' | '90'>('30');
  const [shown, setShown] = useState<string | null>(null);

  const copy = async () => {
    const text = buildAiContext({ days: +period, ms: store.ms, sets: store.sets, foods: store.foods, settings: store.settings, d });
    try {
      await navigator.clipboard.writeText(text);
      toast('Скопировано. Вставьте в Claude или Gemini и допишите вопрос.');
      setShown(null);
    } catch {
      setShown(text); // буфер недоступен — показываем текст для ручного копирования
    }
  };

  return (
    <div>
      <h1>Советы</h1>
      <p className="tiny muted">
        Советы срабатывают по вашим данным. У каждого — источник с PMID/DOI, проверенный через PubMed и Crossref {knowledge.verifiedAt.split('-').reverse().join('.')}. Это не медицинская консультация.
      </p>

      <ReportCard />

      {research.length === 0 && heur.length === 0 && (
        <Card>
          <Empty>Пока ни одно правило не сработало. Для советов нужны замеры, импорт тренировок и записи питания хотя бы за 1–2 недели.</Empty>
        </Card>
      )}

      {research.map((a) => (
        <Card key={a.id} className="advice">
          <div className="row" style={{ marginBottom: 6 }}>
            {a.evidence && <span className="badge badge-accent">{EVIDENCE_RU[a.evidence]}</span>}
            {a.uncertain && <span className="badge badge-warn">есть неопределённость</span>}
          </div>
          <p>
            <b>{a.text}</b>
          </p>
          <p className="tiny muted">{a.claim}</p>
          <div className="src">
            {a.sources.map((s) => (
              <div key={s.pmid}>
                {s.authors} ({s.year}). {s.title}. <i>{s.journal}</i>.{' '}
                <a href={pubmedUrl(s.pmid)} target="_blank" rel="noreferrer">
                  PMID {s.pmid}
                </a>{' '}
                ·{' '}
                <a href={doiUrl(s.doi)} target="_blank" rel="noreferrer">
                  DOI
                </a>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {heur.length > 0 && (
        <>
          <h2 style={{ marginTop: 16 }}>Эвристики и правила (не исследования)</h2>
          {heur.map((a) => (
            <Card key={a.id} className="advice heuristic">
              <span className="badge">не исследование</span>
              <p style={{ marginTop: 6 }}>
                <b>{a.text}</b>
              </p>
              <p className="tiny muted">
                {a.claim} {a.note}
              </p>
            </Card>
          ))}
        </>
      )}

      <Card title="Спросить ИИ бесплатно">
        <p className="tiny muted">
          Кнопка собирает ваши данные за период и инструкцию «отвечай только по рецензируемым исследованиям, указывай PMID/DOI, помечай неуверенность». Вставьте текст в Claude или Gemini — платная интеграция не нужна. Текст содержит данные о здоровье: вставляйте только туда, где готовы ими поделиться.
        </p>
        <Seg<'14' | '30' | '90'>
          value={period}
          onChange={setPeriod}
          label="Период"
          options={[
            ['14', '14 дней'],
            ['30', '30 дней'],
            ['90', '90 дней'],
          ]}
        />
        <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={copy}>
          Скопировать контекст для ИИ
        </button>
        {shown && (
          <>
            <p className="tiny" style={{ color: 'var(--warn)', marginTop: 8 }}>
              Буфер обмена недоступен — выделите текст и скопируйте вручную:
            </p>
            <textarea readOnly value={shown} rows={10} onFocus={(e) => e.currentTarget.select()} />
          </>
        )}
      </Card>
    </div>
  );
}
