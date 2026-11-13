// Академия и отчёт: статьи собираются только из проверяемой базы знаний.
import { describe, it, expect } from 'vitest';
import { ARTICLES, buildArticles } from '../src/lib/academy';
import { knowledge } from '../src/lib/advice/engine';
import { hashParams, actionLinks } from '../src/lib/links';

describe('Академия', () => {
  it('каждое утверждение статьи существует в базе знаний (правило или эвристика)', () => {
    const ids = new Set([...knowledge.rules.map((r) => r.id), ...knowledge.heuristics.map((h) => h.id)]);
    for (const a of ARTICLES) for (const c of a.claims) expect(ids.has(c), `${a.id}: нет «${c}»`).toBe(true);
    for (const a of ARTICLES) for (const e of a.extra ?? []) expect(knowledge.sources[e.source], `${a.id}: нет источника ${e.source}`).toBeDefined();
  });

  it('статьи собираются полностью: ни одно утверждение не потеряно, у научных есть источник с PMID и DOI', () => {
    const built = buildArticles();
    expect(built).toHaveLength(ARTICLES.length);
    built.forEach((a, i) => {
      expect(a.claims).toHaveLength(ARTICLES[i].claims.length + (ARTICLES[i].extra?.length ?? 0));
      for (const c of a.claims) {
        expect(c.text.length).toBeGreaterThan(20);
        if (c.evidence !== null) {
          expect(c.sources.length, `${a.id}: «${c.text.slice(0, 30)}» без источника`).toBeGreaterThan(0);
          for (const s of c.sources) {
            expect(s.pmid).toMatch(/^\d+$/);
            expect(s.doi).toMatch(/^10\./);
          }
        } else {
          expect(c.sources).toEqual([]); // эвристика: источников нет, и мы их не изображаем
        }
      }
    });
  });

  it('у каждой статьи есть заголовок, вступление, шаги и уникальный id; ссылки ведут на существующие экраны', () => {
    const routes = ['#home', '#measure', '#strength', '#food', '#advice', '#settings', '#stats', '#program', '#workout', '#report'];
    expect(new Set(ARTICLES.map((a) => a.id)).size).toBe(ARTICLES.length);
    for (const a of ARTICLES) {
      expect(a.title.length).toBeGreaterThan(5);
      expect(a.lead.length).toBeGreaterThan(10);
      expect(a.steps.length).toBeGreaterThan(0);
      if (a.link) expect(routes).toContain(a.link.href);
    }
  });

  it('статья про эвристики состоит в основном из утверждений без исследований', () => {
    const h = buildArticles().find((a) => a.id === 'heuristics')!;
    expect(h.claims.filter((c) => c.evidence === null).length).toBeGreaterThanOrEqual(3);
  });
});

describe('Ссылки-действия для Быстрых команд', () => {
  it('параметры читаются из адреса после #', () => {
    expect(hashParams('#food?add=1').get('add')).toBe('1');
    expect(hashParams('#stats?tab=health').get('tab')).toBe('health');
    expect(hashParams('#home').get('add')).toBeNull();
    expect(hashParams('').get('x')).toBeNull();
  });

  it('список ссылок строится от адреса приложения и работает в подпапке', () => {
    const links = actionLinks('https://example.github.io/kanon/');
    expect(links.find((l) => l.id === 'food')!.url).toBe('https://example.github.io/kanon/#food?add=1');
    expect(links.find((l) => l.id === 'workout')!.url).toBe('https://example.github.io/kanon/#workout?start=1');
    expect(new Set(links.map((l) => l.url)).size).toBe(links.length);
    for (const l of links) expect(l.url.startsWith('https://example.github.io/kanon/#')).toBe(true);
  });
});

describe('Экран из адреса', () => {
  it('параметры действия не мешают определить экран', async () => {
    const { hashRoute } = await import('../src/lib/links');
    expect(hashRoute('#food?add=1')).toBe('food');
    expect(hashRoute('#/workout?start=1')).toBe('workout');
    expect(hashRoute('#home')).toBe('home');
    expect(hashRoute('')).toBe('');
  });
});
