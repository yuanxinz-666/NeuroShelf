// Synthetic records for isolated tests only; never shipped as library data.
function candidate(overrides = {}) {
  return { title: 'Weekly fixture: superior colliculus during visual selection', authors: 'Test A; Test B', journal: 'Test journal',
    publishedDate: '2026-09-03', publication: '预印本', doi: '10.99999/weekly-test-1', pmid: '', url: 'https://example.org/weekly-test-1',
    summary: '隔离测试用摘要：记录视觉选择过程中的活动。', relevance: '隔离测试用推荐理由：区分视觉选择与运动输出。',
    caveat: '这是用于验证软件的合成记录，不是真实研究。', module: '注意与决策', match: '直接相关', verification: '已核对摘要',
    tags: ['SC', '视觉选择'], sources: [{ label: '测试来源', url: 'https://example.org/weekly-test-1' }], ...overrides };
}
function batch(candidates = [candidate()], overrides = {}) {
  return { format: 'neuroshelf-weekly', version: 1, weekOf: '2026-09-07', windowStart: '2026-08-24', windowEnd: '2026-09-07',
    screenedAt: '2026-09-07T12:00:00Z', status: 'complete', checkedCount: candidates.length,
    searchedSources: ['隔离测试来源'], summary: '用于验证每周候选收件箱的测试批次。', candidates, ...overrides };
}
module.exports = { candidate, batch };
