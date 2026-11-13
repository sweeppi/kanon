// «Академия»: короткие статьи из проверенной базы знаний. У каждого научного утверждения — уровень доказательности и источник.
import { useMemo } from 'react';
import { buildArticles } from '../lib/academy';
import { EVIDENCE_RU, knowledge, pubmedUrl, doiUrl } from '../lib/advice/engine';
import { Fold, ScreenHead } from '../components/ui';
import { Icon } from '../components/icons';

export function AcademyPage() {
  const articles = useMemo(buildArticles, []);
  return (
    <div>
      <ScreenHead title="Академия" sub={`Коротко о том, на чём основаны советы и программа. Источники проверены через PubMed и Crossref ${knowledge.verifiedAt.split('-').reverse().join('.')}.`} />
      {articles.map((a) => (
        <Fold key={a.id} title={a.title}>
          <p style={{ marginTop: 0 }}>{a.lead}</p>

          <h3 className="group-title">Что известно</h3>
          {a.claims.map((c) => (
            <div key={c.text} className="claim">
              <p className="caption" style={{ margin: '0 0 4px', color: c.evidence ? 'var(--accent)' : 'var(--muted)' }}>
                {c.evidence ? EVIDENCE_RU[c.evidence] : 'Не исследование — эвристика'}
                {c.uncertain && <span style={{ color: 'var(--warn)' }}> — есть неопределённость</span>}
              </p>
              <p style={{ margin: 0 }}>{c.text}</p>
              {c.note && (
                <p className="caption" style={{ margin: '4px 0 0' }}>
                  {c.note}
                </p>
              )}
              {c.sources.map((s) => (
                <p key={s.pmid} className="caption" style={{ margin: '4px 0 0' }}>
                  {s.authors} ({s.year}). {s.title}. <i>{s.journal}</i>.{' '}
                  <a href={pubmedUrl(s.pmid)} target="_blank" rel="noreferrer">
                    PMID {s.pmid}
                  </a>
                  ,{' '}
                  <a href={doiUrl(s.doi)} target="_blank" rel="noreferrer">
                    DOI
                  </a>
                </p>
              ))}
            </div>
          ))}

          <h3 className="group-title">Что делать</h3>
          <ul className="steps-list">
            {a.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {a.link && (
            <a className="btn" href={a.link.href}>
              {a.link.label}
              <Icon name="chevron" size={16} />
            </a>
          )}
        </Fold>
      ))}
      <p className="caption">Это не медицинская консультация. Статьи пересказывают выводы исследований и не заменяют врача или тренера.</p>
    </div>
  );
}
