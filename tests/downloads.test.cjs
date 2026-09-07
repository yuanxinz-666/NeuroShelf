const { test } = require('node:test');
const assert = require('node:assert/strict');
const { titleMatches, htmlPdfLink, publicAddress, verifyDownloaded } = require('../electron/downloads.cjs');
const { fixturePdf } = require('./fixture.cjs');
test('automatically downloaded PDFs require a parseable document matching the paper title', async () => {
  assert.equal(await verifyDownloaded({ title: 'NeuroShelf reader verification' }, fixturePdf()), 2);
  await assert.rejects(verifyDownloaded({ title: 'An entirely different superior colliculus paper with different biological results' }, fixturePdf()), /标题未能/);
  await assert.rejects(verifyDownloaded({ title: 'Test title' }, Buffer.from('<html>Sign in to download</html>')), /有效的 PDF/);
});
test('download discovery parses metadata in either attribute order and rejects non-public IP ranges', () => {
  assert.equal(htmlPdfLink('<meta content="/paper.pdf?a=1&amp;b=2" name="citation_pdf_url">', 'https://example.org/article'), 'https://example.org/paper.pdf?a=1&b=2');
  for (const ip of ['127.0.0.1', '10.0.0.2', '192.168.1.1', '172.16.1.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fd00::1']) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.equal(titleMatches({ title: 'Visual competition in the superior colliculus' }, 'Different mechanisms in a different circuit'), false);
});
