const keyOf = r => [r.system, r.year, r.issn, r.category.toLowerCase()].join('|');
function validateRankings(rows) {
  if (!Array.isArray(rows) || rows.length > 60000) throw new Error('分区表最多支持 60,000 行。');
  const seen = new Map();
  for (const row of rows) {
    const issn = String(row.issn || '').toUpperCase().replace(/[^0-9X]/g, '');
    const year = Number(row.year), quartile = Number(String(row.quartile).replace(/^Q/i, ''));
    if (!['cas', 'jcr'].includes(row.system) || !Number.isInteger(year) || year < 2000 || year > 2200 || !/^[0-9]{7}[0-9X]$/.test(issn) || ![1, 2, 3, 4].includes(quartile)) throw new Error('分区表需要有效的 system、year、ISSN 和 1–4 分区。');
    for (const name of ['journal', 'category', 'source']) if (typeof row[name] !== 'string' || !row[name].trim() || row[name].length > 4000) throw new Error('每行分区需要期刊名、学科分类和来源链接。');
    const source = new URL(row.source); if (source.protocol !== 'https:' || source.username || source.password) throw new Error('分区来源必须是 HTTPS 链接。');
    const scie = row.scie === true || ['true', 'yes', '1', 'scie', 'sci'].includes(String(row.scie).toLowerCase());
    if (!scie && !['false', 'no', '0'].includes(String(row.scie).toLowerCase())) throw new Error('scie 需明确填写 true 或 false，不能仅凭 Q1 推断 SCI 收录。');
    const value = { system: row.system, year, issn, journal: row.journal.trim(), category: row.category.trim(), quartile, scie, source: source.href };
    const key = keyOf(value), old = seen.get(key);
    if (old && (old.quartile !== quartile || old.scie !== scie)) throw new Error('相同期刊、年份与分类存在冲突分区，请核对后导入。');
    seen.set(key, value);
  }
  return [...seen.values()];
}
function parseCsv(text) {
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === ',' || c === '\n')) { row.push(value.replace(/\r$/, '').trim()); value = ''; if (c === '\n') { rows.push(row); row = []; } }
    else value += c;
  }
  if (quoted) throw new Error('CSV 引号未闭合。');
  if (value || row.length) { row.push(value.trim()); rows.push(row); }
  const header = rows.shift()?.map(s => s.replace(/^\uFEFF/, '').toLowerCase());
  const expected = ['system', 'year', 'issn', 'journal', 'category', 'quartile', 'scie', 'source'];
  if (!header || expected.some(k => !header.includes(k))) throw new Error('CSV 表头需包含：' + expected.join(', '));
  return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(header.map((k, i) => [k, r[i] || ''])));
}
function parseRankings(text, isCsv) {
  if (text.length > 16 * 1024 * 1024) throw new Error('分区表文件过大。');
  if (isCsv) return validateRankings(parseCsv(text));
  const raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (raw.format !== 'neuroshelf-journal-rankings' || raw.version !== 1) throw new Error('分区 JSON 格式无效。');
  return validateRankings(raw.rows);
}
module.exports = { validateRankings, parseRankings, keyOf };
