import { describe, expect, it } from 'vitest';
import { MAX_DOCUMENT_BYTES } from '@/lib/domain/document-upload';
import { linksFromText, mergeLinks } from '@/lib/domain/pack/links';
import {
  MAX_LINK_FILE_BYTES,
  MAX_PACK_BYTES,
  MAX_PACK_FILES,
  baseName,
  sortPackEntries,
} from '@/lib/domain/pack/sort';

const kb = 1024;
const entry = (path: string, size = 100 * kb) => ({ path, size });

describe('sorting a company zip (D101)', () => {
  it('tells the pack, the invoices, the agreements and the link files apart by name', () => {
    const sorted = sortPackEntries([
      entry('chaya sri trade/CHAYA SRI TRADE CO., LTD dbd.pdf', 3000 * kb),
      entry('chaya sri trade/invoice/invoice 1.pdf'),
      entry('chaya sri trade/Invoices/b.PDF'),
      entry('chaya sri trade/agreement/agreement (1).pdf'),
      entry('chaya sri trade/สัญญา/a.pdf'),
      entry('chaya sri trade/chaya sri trade fb.doc', 10 * kb),
      entry('chaya sri trade/website.txt', 1 * kb),
      entry('__MACOSX/chaya sri trade/._dbd.pdf'),
      entry('chaya sri trade/.DS_Store'),
      entry('chaya sri trade/photo.jpg'),
      entry('chaya sri trade/invoice/'),
    ]);
    expect(sorted.problem).toBeNull();
    expect(sorted.documents.map((d) => [baseName(d.path), d.group])).toEqual([
      ['CHAYA SRI TRADE CO., LTD dbd.pdf', 'pack'],
      ['invoice 1.pdf', 'invoice'],
      ['b.PDF', 'invoice'],
      ['agreement (1).pdf', 'agreement'],
      ['a.pdf', 'agreement'],
    ]);
    expect(sorted.linkFiles.map((f) => baseName(f.path))).toEqual([
      'chaya sri trade fb.doc',
      'website.txt',
    ]);
    expect(sorted.ignored).toEqual([
      '__MACOSX/chaya sri trade/._dbd.pdf',
      'chaya sri trade/.DS_Store',
      'chaya sri trade/photo.jpg',
      'chaya sri trade/invoice/',
    ]);
  });

  it('reads an invoice or an agreement from the file name when there is no folder', () => {
    const sorted = sortPackEntries([
      entry('dbd.pdf'),
      entry('Invoice-0012.pdf'),
      entry('Contract A.pdf'),
    ]);
    expect(sorted.documents.map((d) => d.group)).toEqual(['pack', 'invoice', 'agreement']);
  });

  it('refuses what cannot be uploaded, naming the first problem', () => {
    expect(sortPackEntries([entry('notes.txt')]).problem).toBe('no-document');
    expect(sortPackEntries([entry('a.jpg')]).problem).toBe('no-document');
    const many = Array.from({ length: MAX_PACK_FILES + 1 }, (_, i) => entry(`invoice/i${i}.pdf`));
    expect(sortPackEntries(many).problem).toBe('too-many-files');
    expect(sortPackEntries([entry('dbd.pdf', MAX_DOCUMENT_BYTES + 1)]).problem).toBe(
      'file-too-large',
    );
    const heavy = Array.from({ length: 8 }, (_, i) => entry(`invoice/i${i}.pdf`, 29 * 1024 * kb));
    expect(sortPackEntries(heavy).problem).toBe('zip-too-large');
    expect(MAX_PACK_BYTES).toBe(200 * 1024 * 1024);
  });

  it('leaves a link file over a megabyte out: it is not a sentence with an address', () => {
    const sorted = sortPackEntries([entry('dbd.pdf'), entry('big.doc', MAX_LINK_FILE_BYTES + 1)]);
    expect(sorted.linkFiles).toEqual([]);
    expect(sorted.ignored).toEqual(['big.doc']);
  });
});

describe('the addresses in a link file (D101)', () => {
  it('takes the first Facebook address as the page and the first other address as the website', () => {
    expect(
      linksFromText(
        'Facebook: https://www.facebook.com/Chayasritrade/ shop at www.chayasri.co.th.',
      ),
    ).toEqual({
      facebook: 'https://www.facebook.com/Chayasritrade',
      website: 'https://www.chayasri.co.th',
    });
  });

  it('knows the short Facebook hosts, and leaves a mail address alone', () => {
    expect(linksFromText('fb.com/thara').facebook).toBeNull();
    expect(linksFromText('https://fb.com/thara').facebook).toBe('https://fb.com/thara');
    expect(linksFromText('https://m.facebook.com/thara?ref=1').facebook).toBe(
      'https://m.facebook.com/thara?ref=1',
    );
    expect(linksFromText('write to mailto:info@example.co.th')).toEqual({
      website: null,
      facebook: null,
    });
    expect(linksFromText('nothing here')).toEqual({ website: null, facebook: null });
  });

  it('merges several files, first address of each kind winning', () => {
    expect(
      mergeLinks([
        { website: null, facebook: 'https://www.facebook.com/one' },
        { website: 'https://one.co.th', facebook: 'https://www.facebook.com/two' },
      ]),
    ).toEqual({ website: 'https://one.co.th', facebook: 'https://www.facebook.com/one' });
  });
});
