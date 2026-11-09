import { describe, it, expect } from 'vitest';
import { evaluateAdvice, knowledge, type AdviceContext } from '../src/lib/advice/engine';

describe('База знаний', () => {
  it('у каждого исследовательского правила есть проверенные источники с PMID и DOI', () => {
    for (const r of knowledge.rules) {
      expect(r.sources.length).toBeGreaterThan(0);
      for (const s of r.sources) {
        const src = knowledge.sources[s];
        expect(src, `${r.id}: ${s}`).toBeDefined();
        expect(src.pmid).toMatch(/^\d+$/);
        expect(src.doi).toMatch(/^10\./);
      }
    }
  });
  it('эвристики помечены «не исследование» или «правило приложения» и не ссылаются на исследования', () => {
    for (const h of knowledge.heuristics) {
      expect(h.note).toMatch(/Не исследование|Правило приложения/);
      expect((h as unknown as { sources?: unknown }).sources).toBeUndefined();
    }
  });
});

describe('Срабатывание советов', () => {
  it('пустой контекст — ничего не срабатывает', () => {
    expect(evaluateAdvice({})).toEqual([]);
  });
  it('пример: сушка слишком быстро, мало белка, мало объёма, гиперлордоз', () => {
    const ctx: AdviceContext = {
      cutting: true,
      weightKg: 80,
      weightRatePctPerWeek: -1.4,
      proteinAvg: 110,
      proteinTargetMin: 150,
      weeklySets: { chest: 12, back: 14, shoulders: 6, biceps: 8, triceps: 10, quads: 10, hamstrings: 10, glutes: 10, calves: 12 },
      hyperlordosis: true,
      axialExercises: ['Squat (Barbell)'],
      waistToHeight: 0.47,
      daysSinceBackup: null,
    };
    const a = evaluateAdvice(ctx);
    const ids = a.map((x) => x.id);
    expect(ids).toContain('loss-too-fast');
    expect(ids).toContain('protein-low');
    expect(ids).toContain('volume-low');
    expect(ids).toContain('lordosis-axial');
    expect(ids).toContain('backup');
    expect(ids).not.toContain('whtr-high');
    const loss = a.find((x) => x.id === 'loss-too-fast')!;
    expect(loss.text).toMatch(/1,4 %/);
    expect(loss.sources.map((s) => s.pmid)).toContain('21558571');
    expect(a.find((x) => x.id === 'volume-low')!.text).toMatch(/дельты, бицепс/);
    expect(a.find((x) => x.id === 'protein-low')!.text).toMatch(/40 г/);
    // эвристика без источников
    expect(a.find((x) => x.id === 'backup')!.kind).toBe('heuristic');
  });
  it('плато только на сушке и от 3 недель', () => {
    expect(evaluateAdvice({ cutting: true, plateauWeeks: 3 }).map((x) => x.id)).toContain('plateau');
    expect(evaluateAdvice({ cutting: false, plateauWeeks: 5 }).map((x) => x.id)).not.toContain('plateau');
    expect(evaluateAdvice({ cutting: true, plateauWeeks: 2 }).map((x) => x.id)).not.toContain('plateau');
  });
  it('падение 1ПМ на сушке', () => {
    const a = evaluateAdvice({ e1rmDrops: [{ exercise: 'Bench Press (Barbell)', pct: 7.2 }] });
    expect(a[0].id).toBe('strength-drop-cut');
    expect(a[0].text).toContain('Bench Press');
  });
});
