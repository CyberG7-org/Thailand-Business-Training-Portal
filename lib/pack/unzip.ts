import { strFromU8, unzip, unzipSync } from 'fflate';
import { linksFromText, mergeLinks, type PackLinks } from '@/lib/domain/pack/links';
import {
  MAX_LINK_FILE_BYTES,
  MAX_PACK_BYTES,
  baseName,
  classifyPackPath,
  sortPackEntries,
  type PackGroup,
  type PackProblem,
  type SortedPack,
} from '@/lib/domain/pack/sort';

/**
 * The company zip, opened where it was picked — in the browser — so that each document travels
 * to the bucket as a PDF upload does today and nothing large crosses a server function (spec
 * 2026-10-06 §2, D101). No Node imports: this runs in the page.
 */
export class PackZipError extends Error {
  constructor(public readonly code: PackProblem | 'cannot-open') {
    super(code);
    this.name = 'PackZipError';
  }
}

export type PackFile = { group: PackGroup; file: File };
export type OpenedPack = { sorted: SortedPack; files: PackFile[]; links: PackLinks };

/** Every entry of a zip with its bytes; a zip that cannot be opened throws. */
type UnpackLimits = { maxExpandedBytes?: number; maxEntries?: number };
const MAX_ARCHIVE_ENTRIES = 200;

export function unpackZip(
  bytes: Uint8Array,
  limits: UnpackLimits = {},
): Promise<{ path: string; size: number; bytes: Uint8Array }[]> {
  const maxExpandedBytes = limits.maxExpandedBytes ?? MAX_PACK_BYTES;
  const maxEntries = limits.maxEntries ?? MAX_ARCHIVE_ENTRIES;
  if (bytes.byteLength > MAX_PACK_BYTES) {
    return Promise.reject(new PackZipError('zip-too-large'));
  }
  return new Promise((resolve, reject) => {
    let expandedBytes = 0;
    let entries = 0;
    let problem: PackProblem | null = null;
    const metadata: { path: string; size: number }[] = [];
    unzip(
      bytes,
      {
        filter(info) {
          if (info.name.endsWith('/')) return false;
          entries += 1;
          expandedBytes += info.originalSize;
          metadata.push({ path: info.name, size: info.originalSize });
          if (entries > maxEntries) problem = 'too-many-files';
          if (expandedBytes > maxExpandedBytes) problem = 'zip-too-large';
          if (problem) return false;
          const kind = classifyPackPath(info.name);
          return kind !== null && !(kind === 'link' && info.originalSize > MAX_LINK_FILE_BYTES);
        },
      },
      (error, files) => {
        if (error) {
          reject(new PackZipError('cannot-open'));
          return;
        }
        if (problem) {
          reject(new PackZipError(problem));
          return;
        }
        resolve(
          metadata.map(({ path, size }) => ({
            path,
            size,
            bytes: files[path] ?? new Uint8Array(),
          })),
        );
      },
    );
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
  if (zip.size > MAX_PACK_BYTES) throw new PackZipError('zip-too-large');
  const entries = await unpackZip(new Uint8Array(await zip.arrayBuffer()));
  const sorted = sortPackEntries(entries.map((e) => ({ path: e.path, size: e.size })));
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
