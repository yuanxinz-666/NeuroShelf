const fs = require('node:fs/promises');
const path = require('node:path');
function fixturePdf() {
  const pageOne = 'BT /F1 25 Tf 58 737 Td (NeuroShelf reader verification) Tj 0 -35 Td /F1 11 Tf (TEST DOCUMENT - not a research publication) Tj 0 -42 Td /F1 14 Tf (This is a synthetic PDF used to test the reader.) Tj 0 -28 Td (Nigral input to the superior colliculus can affect orienting behavior.) Tj 0 -28 Td (This example is not scientific evidence and must not be cited.) Tj 0 -42 Td (Select this sentence to ask a question or save a highlight.) Tj 0 -390 Td /F1 11 Tf (PDF page 1 / 2) Tj ET';
  const pageTwo = 'BT /F1 25 Tf 58 737 Td (A figure and its context) Tj 0 -42 Td /F1 14 Tf (Figure example: compare a control group with a test group.) Tj 0 -28 Td (Attention and motor output are different interpretations.) Tj 0 -28 Td (Synthetic data. This figure does not represent an experiment.) Tj ET 0.3 0.5 0.4 rg 85 265 110 140 re f 0.55 0.67 0.56 rg 250 265 110 225 re f 0 0 0 rg BT /F1 13 Tf 105 240 Td (Control) Tj 158 0 Td (Test) Tj -205 -180 Td /F1 11 Tf (PDF page 2 / 2) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(pageOne)} >>\nstream\n${pageOne}\nendstream`,
    `<< /Length ${Buffer.byteLength(pageTwo)} >>\nstream\n${pageTwo}\nendstream`,
  ];
  let result = '%PDF-1.4\n', offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(result)); result += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}
if (require.main === module) { const dir = path.resolve(__dirname, '../.test-data'); fs.mkdir(dir, { recursive: true }).then(() => fs.writeFile(path.join(dir, 'reader-verification.pdf'), fixturePdf())).then(() => console.log('Created .test-data/reader-verification.pdf')); }
module.exports = { fixturePdf };
