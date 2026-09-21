// Generates the PDF fixtures under tests/fixtures (text-only, no real data):
// - three-pages.pdf: three pages for slicing/indexing tests
// - encrypted.pdf: one page whose trailer declares standard encryption, so readers report it as
//   encrypted (pdf-lib cannot write real ciphertext; the declaration is what the upload gate checks)
import { writeFileSync } from 'node:fs';
import { PDFDocument, PDFHexString, PDFName, StandardFonts } from 'pdf-lib';

const three = await PDFDocument.create();
const font = await three.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 3; i++) {
  const page = three.addPage([595, 842]);
  page.drawText(`Fixture page ${i} of 3`, { x: 50, y: 780, size: 18, font });
}
writeFileSync('tests/fixtures/three-pages.pdf', await three.save());
console.log('tests/fixtures/three-pages.pdf written');

const encrypted = await PDFDocument.create();
encrypted.addPage([595, 842]);
const encrypt = encrypted.context.obj({
  Filter: PDFName.of('Standard'),
  V: 1,
  R: 2,
  Length: 40,
  P: -1,
  O: PDFHexString.of('00'.repeat(32)),
  U: PDFHexString.of('00'.repeat(32)),
});
encrypted.context.trailerInfo.Encrypt = encrypted.context.register(encrypt);
writeFileSync('tests/fixtures/encrypted.pdf', await encrypted.save({ useObjectStreams: false }));
console.log('tests/fixtures/encrypted.pdf written');
