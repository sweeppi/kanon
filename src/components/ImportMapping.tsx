// Сопоставление колонок файла с полями приложения (общий компонент для всех импортов).
import type { FieldDef, Mapping, Table } from '../lib/import/table';

export function MappingEditor({ table, fields, mapping, onChange }: { table: Table; fields: FieldDef[]; mapping: Mapping; onChange: (m: Mapping) => void }) {
  const sample = table.rows[0] ?? [];
  return (
    <div className="stack">
      {fields.map((f) => {
        const idx = mapping[f.key] ?? -1;
        return (
          <label key={f.key} className="field">
            <span className="field-label">
              <span>
                {f.label}
                {f.required && <b style={{ color: 'var(--accent)' }}> *</b>}
              </span>
              {idx >= 0 && sample[idx] !== undefined && <span className="tiny">пример: {String(sample[idx]).slice(0, 24) || '—'}</span>}
            </span>
            <select
              value={idx}
              onChange={(e) => onChange({ ...mapping, [f.key]: +e.target.value })}
              className={f.required && idx < 0 ? 'invalid' : ''}
              aria-label={`Колонка для поля «${f.label}»`}
            >
              <option value={-1}>— нет —</option>
              {table.header.map((h, i) => (
                <option key={i} value={i}>
                  {h || `Колонка ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

/** Сводка сопоставления одной строкой: «Дата ← start_time, Упражнение ← exercise_title …». */
export function mappingSummary(table: Table, fields: FieldDef[], mapping: Mapping): string {
  return fields
    .filter((f) => (mapping[f.key] ?? -1) >= 0)
    .map((f) => `${f.label} ← ${table.header[mapping[f.key]]}`)
    .join(' · ');
}
