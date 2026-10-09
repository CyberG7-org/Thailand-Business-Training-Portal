import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';

/** An uploadable DBD pack with a page URL; the URL is deliberately not assumed readable. */
export function companyZip(pdfPath = 'tests/fixtures/tiny.pdf') {
  return {
    name: `company-${Date.now()}.zip`,
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({
        'company/dbd.pdf': new Uint8Array(readFileSync(pdfPath)),
        'company/links.txt': strToU8('Facebook https://www.facebook.com/chayasritrade/'),
      }),
    ),
  };
}
