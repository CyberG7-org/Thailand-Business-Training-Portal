// Generates tests/fixtures/three-pages.pdf: three text-only pages, no real data.
import { writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 3; i++) {
  const page = doc.addPage([595, 842]);
  page.drawText(`Fixture page ${i} of 3`, { x: 50, y: 780, size: 18, font });
}
writeFileSync('tests/fixtures/three-pages.pdf', await doc.save());
console.log('tests/fixtures/three-pages.pdf written');
