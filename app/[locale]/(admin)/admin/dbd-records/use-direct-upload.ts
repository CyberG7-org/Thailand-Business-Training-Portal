'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { uploadDocumentToSignedUrl } from '@/lib/db/browser-storage';
import { checkDocumentFiles } from '@/lib/domain/document-upload';
import { prepareUploadsAction, registerUploadsAction, type ToolState } from './actions';

export const UPLOAD_ERROR_KEYS = ['no-file', 'invalid-file', 'upload-failed'] as const;

/**
 * Browser-direct document upload: the server issues signed upload URLs (creating the record when
 * there is none), the browser sends each PDF straight to the bucket, and the server registers the
 * objects and reads them. Nothing bigger than a few field names crosses a function boundary, so
 * scanned packs of tens of megabytes work on Vercel.
 */
export function useDirectUpload(options: { locale: string; id: string | null; redirect: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<ToolState>({ ok: false, error: null });
  const [pending, startTransition] = useTransition();

  const submit = (form: HTMLFormElement) => {
    const input = form.elements.namedItem('document');
    const files = Array.from(input instanceof HTMLInputElement ? (input.files ?? []) : []).filter(
      (f) => f.size > 0,
    );
    startTransition(async () => {
      const problem = checkDocumentFiles(files);
      if (problem) {
        setState({ ok: false, error: problem });
        return;
      }
      const prepared = await prepareUploadsAction({
        locale: options.locale,
        id: options.id,
        files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      });
      if (!prepared.ok) {
        setState({ ok: false, error: prepared.error });
        return;
      }
      try {
        for (const [i, upload] of prepared.uploads.entries()) {
          await uploadDocumentToSignedUrl(upload.path, upload.token, files[i]);
        }
      } catch {
        setState({ ok: false, error: 'upload-failed' });
        return;
      }
      const result = await registerUploadsAction({
        locale: options.locale,
        id: prepared.id,
        uploads: prepared.uploads.map((u, i) => ({ path: u.path, name: files[i].name })),
        redirect: options.redirect,
      });
      if (result.ok && result.redirectTo) {
        router.push(result.redirectTo);
        return;
      }
      setState(result);
      if (result.ok) {
        form.reset();
        router.refresh();
      }
    });
  };

  return { state, pending, submit };
}
