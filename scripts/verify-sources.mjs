// Проверка всех ссылок базы знаний через PubMed (PMID) и Crossref (DOI).
// Запуск: npm run verify-sources      (нужен интернет; ключи и аккаунты не нужны)
// Флаг --fix переписывает авторов/названия/журналы из PubMed, если они расходятся.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KB_PATH = resolve(ROOT, 'src/lib/advice/knowledge.json');
const kb = JSON.parse(readFileSync(KB_PATH, 'utf8'));
const fix = process.argv.includes('--fix');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normT = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const ids = Object.values(kb.sources).map((s) => s.pmid);
const res = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`);
const pm = (await res.json()).result;
let bad = 0;
for (const [key, s] of Object.entries(kb.sources)) {
  const r = pm[s.pmid];
  const problems = [];
  if (!r || r.error) problems.push('PMID не найден');
  else {
    const doi = (r.articleids || []).find((a) => a.idtype === 'doi')?.value;
    if (!r.pubdate?.startsWith(String(s.year))) problems.push(`год ${r.pubdate}`);
    if (!normT(r.title).startsWith(normT(s.title).slice(0, 40))) problems.push(`название: ${r.title}`);
    if (doi && doi.toLowerCase() !== s.doi.toLowerCase()) problems.push(`DOI в PubMed: ${doi}`);
    const names = r.authors.map((a) => a.name);
    const authors = names.length > 6 ? names.slice(0, 3).join(', ') + ', et al.' : names.join(', ');
    if (authors !== s.authors) {
      if (fix) s.authors = authors;
      else problems.push(`авторы в PubMed: ${authors}`);
    }
    if (fix) s.journal = r.source;
  }
  await sleep(150);
  const cr = await fetch(`https://api.crossref.org/works/${encodeURIComponent(s.doi)}`);
  if (cr.status !== 200) problems.push(`Crossref HTTP ${cr.status}`);
  console.log(`${problems.length ? '✗' : '✓'} ${key.padEnd(20)} PMID ${s.pmid}  DOI ${s.doi}${problems.length ? '  → ' + problems.join('; ') : ''}`);
  if (problems.length) bad++;
}
if (fix) writeFileSync(KB_PATH, JSON.stringify(kb, null, 2) + '\n');
console.log(bad ? `\nПроблемы: ${bad}` : `\nВсе ${ids.length} источников подтверждены.`);
process.exit(bad ? 1 : 0);
