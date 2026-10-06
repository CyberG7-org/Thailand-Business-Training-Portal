import { strFromU8, unzip, unzipSync } from 'fflate';
import { linksFromText, mergeLinks, type PackLinks } from '@/lib/domain/pack/links';
import { baseName, sortPackEntries, type PackGroup, type SortedPack } from '@/lib/domain/pack/sort';

/**
 * The company zip, opened where it was picked — in the browser — so that each document travels
 * to the bucket as a PDF upload does today and nothing large crosses a server function (spec
 * 2026-10-06 §2, D101). No Node imports: this runs in the page.
 */
export class PackZipError extends Error {
  constructor(public readonly code: 'cannot-open') {
    super(code);
    this.name = 'PackZipError';
  }
}

export type PackFile = { group: PackGroup; file: File };
export type OpenedPack = { sorted: SortedPack; files: PackFile[]; links: PackLinks };

/** Every entry of a zip with its bytes; a zip that cannot be opened throws. */
export function unpackZip(bytes: Uint8Array): Promise<{ path: string; bytes: Uint8Array }[]> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, files) => {
      if (error) {
        reject(new PackZipError('cannot-open'));
        return;
      }
      resolve(Object.entries(files).map(([path, data]) => ({ path, bytes: data })));
    });
  });
}

const TAGS = /<[^>]+>/g;

/**
 * The readable text of a link file. A `.docx` is a zip whose `word/document.xml` holds the text
 * between tags; a Word 97 `.doc` keeps its text as Latin-1 or UTF-16, so both readings are joined
 * — an address survives either way; everything else is plain text.
 */
export function textOfLinkFile(path: string, bytes: Uint8Array): string {
  const name = baseName(path).toLowerCase();
  if (name.endsWith('.docx')) {
    try {
      const inner = unzipSync(bytes);
      const xml = inner['word/document.xml'];
      return xml ? strFromU8(xml).replace(TAGS, ' ') : '';
    } catch {
      return '';
    }
  }
  if (name.endsWith('.doc')) {
    return `${new TextDecoder('latin1').decode(bytes)}\n${new TextDecoder('utf-16le').decode(bytes)}`;
  }
  return new TextDecoder().decode(bytes).replace(TAGS, ' ');
}

/** The zip a manager picked: its documents sorted and wrapped as files, and its addresses. */
export async function openPack(zip: File): Promise<OpenedPack> {
  const entries = await unpackZip(new Uint8Array(await zip.arrayBuffer()));
  const sorted = sortPackEntries(entries.map((e) => ({ path: e.path, size: e.bytes.byteLength })));
  const byPath = new Map(entries.map((e) => [e.path, e.bytes]));
  const files = sorted.documents.map((d) => ({
    group: d.group,
    file: new File([byPath.get(d.path)! as BlobPart], baseName(d.path), {
      type: 'application/pdf',
    }),
  }));
  const links = mergeLinks(
    sorted.linkFiles.map((f) => linksFromText(textOfLinkFile(f.path, byPath.get(f.path)!))),
  );
  return { sorted, files, links };
}
