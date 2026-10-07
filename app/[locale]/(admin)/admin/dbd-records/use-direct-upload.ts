'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { uploadDocumentToSignedUrl } from '@/lib/db/browser-storage';
import { checkDocumentFiles } from '@/lib/domain/document-upload';
import type { PackLinks } from '@/lib/domain/pack/links';
import { classifyPackPath, type PackGroup, type PackProblem } from '@/lib/domain/pack/sort';
import { PackZipError, openPack, type OpenedPack } from '@/lib/pack/unzip';
import { prepareUploadsAction, registerUploadsAction, type ToolState } from './actions';

export const UPLOAD_ERROR_KEYS = [
  'no-file',
  'invalid-file',
  'upload-failed',
  'no-document',
  'too-many-files',
  'file-too-large',
  'zip-too-large',
  'cannot-open',
] as const;

/** What a chosen zip holds, shown before anything is sent (spec 2026-10-06 §2). */
export type PackPreview = {
  zipName: string;
  pack: number;
  invoices: number;
  agreements: number;
  ignored: number;
  links: PackLinks;
  problem: PackProblem | 'cannot-open' | null;
};

const isZip = (f: File) =>
  f.type === 'application/zip' ||
  f.type === 'application/x-zip-compressed' ||
  /\.zip$/i.test(f.name);

function previewOf(zipName: string, opened: OpenedPack): PackPreview {
  const count = (group: PackGroup) => opened.files.filter((f) => f.group === group).length;
  return {
    zipName,
    pack: count('pack'),
    invoices: count('invoice'),
    agreements: count('agreement'),
    ignored: opened.sorted.ignored.length,
    links: opened.links,
    problem: opened.sorted.problem,
  };
}

/**
 * Browser-direct document upload: the server issues signed upload URLs (creating the record when
 * there is none), the browser sends each PDF straight to the bucket, and the server registers the
 * objects and reads them. Nothing bigger than a few field names crosses a function boundary, so
 * scanned packs of tens of megabytes work on Vercel.
 *
 * A company zip (D101) is opened here, in the browser: its PDFs are sorted into the DBD pack,
 * the invoices and the agreements and travel one by one as PDFs; its link files give the
 * company's addresses, which travel as text. `inspect` shows what the zip holds before the
 * manager presses the button.
 */
export function useDirectUpload(options: { locale: string; id: string | null; redirect: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<ToolState>({ ok: false, error: null });
  const [preview, setPreview] = useState<PackPreview | null>(null);
  const [opened, setOpened] = useState<OpenedPack | null>(null);
  const [pending, startTransition] = useTransition();

  /** Called when the file input changes: a zip is opened and summarised; PDFs need nothing. */
  const inspect = async (chosen: File[]) => {
    const zip = chosen.find(isZip);
    if (!zip) {
      setOpened(null);
      setPreview(null);
      return;
    }
    try {
      const pack = await openPack(zip);
      setOpened(pack);
      setPreview(previewOf(zip.name, pack));
    } catch (e) {
      setOpened(null);
      setPreview({
        zipName: zip.name,
        pack: 0,
        invoices: 0,
        agreements: 0,
        ignored: 0,
        links: { website: null, facebook: null },
        problem: e instanceof PackZipError ? e.code : 'cannot-open',
      });
    }
  };

  const submit = (form: HTMLFormElement) => {
    const input = form.elements.namedItem('document');
    const chosen = Array.from(input instanceof HTMLInputElement ? (input.files ?? []) : []).filter(
      (f) => f.size > 0,
    );
    const zip = chosen.find(isZip);
    startTransition(async () => {
      let files: { group: PackGroup; file: File }[];
      let links: PackLinks | undefined;
      if (zip) {
        // The zip inspected a moment ago, or one not inspected yet: open it now.
        const pack =
          opened && preview?.zipName === zip.name ? opened : await openPack(zip).catch(() => null);
        if (!pack) {
          setState({ ok: false, error: 'cannot-open' });
          return;
        }
        if (pack.sorted.problem) {
          setState({ ok: false, error: pack.sorted.problem });
          return;
        }
        files = pack.files;
        links = pack.links;
      } else {
        files = chosen.map((file) => {
          const classified = classifyPackPath(file.name);
          return {
            group: classified === 'invoice' || classified === 'agreement' ? classified : 'pack',
            file,
          };
        });
      }
      const problem = checkDocumentFiles(files.map((f) => f.file));
      if (problem) {
        setState({ ok: false, error: problem });
        return;
      }
      const prepared = await prepareUploadsAction({
        locale: options.locale,
        id: options.id,
        files: files.map((f) => ({
          name: f.file.name,
          size: f.file.size,
          type: f.file.type,
          group: f.group,
        })),
      });
      if (!prepared.ok) {
        setState({ ok: false, error: prepared.error });
        return;
      }
      try {
        for (const [i, upload] of prepared.uploads.entries()) {
          await uploadDocumentToSignedUrl(upload.path, upload.token, files[i].file);
        }
      } catch {
        setState({ ok: false, error: 'upload-failed' });
        return;
      }
      const result = await registerUploadsAction({
        locale: options.locale,
        id: prepared.id,
        uploads: prepared.uploads.map((u, i) => ({
          path: u.path,
          name: files[i].file.name,
          group: files[i].group,
        })),
        links,
        redirect: options.redirect,
      });
      if (result.ok && result.redirectTo) {
        router.push(result.redirectTo);
        return;
      }
      setState(result);
      if (result.ok) {
        form.reset();
        setOpened(null);
        setPreview(null);
        router.refresh();
      }
    });
  };

  return { state, pending, submit, inspect, preview };
}
