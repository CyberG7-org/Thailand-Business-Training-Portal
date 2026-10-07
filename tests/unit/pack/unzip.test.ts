import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { PackZipError, openPack, textOfLinkFile, unpackZip } from '@/lib/pack/unzip';

const pdf = new Uint8Array(readFileSync('tests/fixtures/three-pages.pdf'));
const utf16 = (s: string) => new Uint8Array(Buffer.from(s, 'utf16le'));
const docx = (text: string) =>
  zipSync({
    'word/document.xml': strToU8(`<w:document><w:p><w:t>${text}</w:t></w:p></w:document>`),
  });

/** The Owner's example, as a zip: a pack, invoices and agreements in folders, a Word link file. */
function exampleZip(): Uint8Array {
  return zipSync({
    'chaya sri trade/CHAYA SRI TRADE CO., LTD dbd.pdf': pdf,
    'chaya sri trade/invoice/invoice 1.pdf': pdf,
    'chaya sri trade/invoice/invoice 2.pdf': pdf,
    'chaya sri trade/agreement/agreement (1).pdf': pdf,
    'chaya sri trade/chaya sri trade fb.doc': utf16(
      'Facebook \u0000 https://www.facebook.com/Chayasritrade/ \u0000',
    ),
    'chaya sri trade/website.docx': docx('see www.chayasri.co.th for the shop'),
    '__MACOSX/chaya sri trade/._dbd.pdf': strToU8('junk'),
  });
}

/** The supplied pack's exact shape: five invoices and agreements, Facebook, no website. */
function facebookOnlyPack(): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    'chaya sri trade/CHAYA SRI TRADE CO., LTD dbd.pdf': pdf,
    'chaya sri trade/chaya sri trade fb.doc': utf16(
      'Facebook \u0000 https://www.facebook.com/Chayasritrade/ \u0000',
    ),
  };
  for (let n = 1; n <= 5; n += 1) {
    entries[`chaya sri trade/invoice/invoice ${n}.pdf`] = pdf;
    entries[`chaya sri trade/agreement/agreement (${n}).pdf`] = pdf;
  }
  return zipSync(entries);
}

describe('opening a company zip in the browser (D101)', () => {
  it('lists every entry with its bytes', async () => {
    const entries = await unpackZip(exampleZip());
    expect(entries.map((e) => e.path).sort()).toHaveLength(7);
    expect(entries.find((e) => e.path.endsWith('invoice 1.pdf'))?.bytes).toEqual(pdf);
  });

  it('refuses a file that is not a zip', async () => {
    await expect(unpackZip(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(PackZipError);
  });

  it('rejects archive entry and expanded-byte bombs before keeping their contents', async () => {
    const threeEntries = zipSync({
      'one.bin': strToU8('1'),
      'two.bin': strToU8('2'),
      'three.bin': strToU8('3'),
    });
    await expect(unpackZip(threeEntries, { maxEntries: 2 })).rejects.toMatchObject({
      code: 'too-many-files',
    });
    const compressedLargeEntry = zipSync({ 'ignored.bin': new Uint8Array(64) });
    await expect(unpackZip(compressedLargeEntry, { maxExpandedBytes: 32 })).rejects.toMatchObject({
      code: 'zip-too-large',
    });
  });

  it('reads the text of a .doc, a .docx and a plain file', () => {
    expect(textOfLinkFile('a/fb.doc', utf16('x https://www.facebook.com/one y'))).toContain(
      'https://www.facebook.com/one',
    );
    expect(textOfLinkFile('a/site.docx', docx('www.site.co.th'))).toContain('www.site.co.th');
    expect(textOfLinkFile('a/site.html', strToU8('<a href="x">www.site.co.th</a>'))).toContain(
      'www.site.co.th',
    );
    expect(textOfLinkFile('a/broken.docx', new Uint8Array([1, 2]))).toBe('');
  });

  it('sorts the documents into files and finds both addresses', async () => {
    const opened = await openPack(new File([exampleZip() as BlobPart], 'chaya sri trade.zip'));
    expect(opened.sorted.problem).toBeNull();
    expect(opened.files.map((f) => [f.group, f.file.name])).toEqual([
      ['pack', 'CHAYA SRI TRADE CO., LTD dbd.pdf'],
      ['invoice', 'invoice 1.pdf'],
      ['invoice', 'invoice 2.pdf'],
      ['agreement', 'agreement (1).pdf'],
    ]);
    expect(opened.files[0].file.type).toBe('application/pdf');
    expect(opened.files[0].file.size).toBe(pdf.byteLength);
    expect(opened.links).toEqual({
      facebook: 'https://www.facebook.com/Chayasritrade',
      website: 'https://www.chayasri.co.th',
    });
    expect(opened.sorted.ignored).toEqual(['__MACOSX/chaya sri trade/._dbd.pdf']);
  });

  it('accepts the supplied shape when Facebook exists and the website is absent', async () => {
    const opened = await openPack(
      new File([facebookOnlyPack() as BlobPart], 'chaya sri trade.zip'),
    );
    expect(opened.sorted.problem).toBeNull();
    expect(opened.files.filter((file) => file.group === 'pack')).toHaveLength(1);
    expect(opened.files.filter((file) => file.group === 'invoice')).toHaveLength(5);
    expect(opened.files.filter((file) => file.group === 'agreement')).toHaveLength(5);
    expect(opened.links).toEqual({
      facebook: 'https://www.facebook.com/Chayasritrade',
      website: null,
    });
  });
});
