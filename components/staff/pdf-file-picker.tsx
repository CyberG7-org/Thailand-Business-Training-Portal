'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { FileIcon, UploadIcon } from '@/components/icons';

/**
 * A visible place to put the company's documents: a dashed box with a "Choose files" button that
 * also takes files dropped on it, and the chosen files listed with their sizes. The browser's
 * own file input stays underneath (reachable by keyboard, still `required`, still posted by
 * name); only its "Choose Files / No file chosen" look is replaced. A form reset empties the
 * list. Takes PDFs, or one company zip (D101), which `onChosen` lets the form open and describe
 * in the `preview` slot.
 */
/** KB under a megabyte, so a small scan never reads as 0.0 MB. */
const sizeLabel = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const accepted = (f: File) =>
  f.type === 'application/pdf' ||
  f.type === 'application/zip' ||
  f.type === 'application/x-zip-compressed' ||
  /\.(pdf|zip)$/i.test(f.name);

export function PdfFilePicker({
  name,
  label,
  hint,
  testId,
  strongLabel = false,
  zipOnly = false,
  onChosen,
  preview,
}: {
  name: string;
  label: string;
  hint: string;
  testId?: string;
  strongLabel?: boolean;
  zipOnly?: boolean;
  /** The files just chosen or dropped, for the form to look into. */
  onChosen?: (files: File[]) => void;
  /** What the form found in a chosen zip, shown under the list. */
  preview?: ReactNode;
}) {
  const t = useTranslations('admin.filePicker');
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);

  // The upload empties its form when it is done; the list goes with it.
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const clear = () => setFiles([]);
    form.addEventListener('reset', clear);
    return () => form.removeEventListener('reset', clear);
  }, []);

  const choose = (chosen: File[]) => {
    setFiles(chosen);
    onChosen?.(chosen);
  };

  const take = (dropped: FileList) => {
    const usable = [...dropped].filter((file) =>
      zipOnly ? /\.zip$/i.test(file.name) : accepted(file),
    );
    if (usable.length === 0 || !input.current) return;
    const transfer = new DataTransfer();
    for (const f of usable) transfer.items.add(f);
    input.current.files = transfer.files;
    choose(usable);
  };

  return (
    <div className="text-sm">
      <span className={strongLabel ? 'font-semibold text-ink-900' : undefined}>{label}</span>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
        className={`mt-1 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-control border-2 border-dashed px-4 py-5 text-center transition-colors focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/30 ${
          over
            ? 'border-brand-600 bg-brand-50'
            : 'border-ink-300 bg-ink-50 hover:border-brand-600 hover:bg-brand-50'
        }`}
      >
        <span className="staff-btn pointer-events-none">
          <UploadIcon />
          {t('choose')}
        </span>
        <span className="text-ink-500">{t('orDrop')}</span>
        <input
          ref={input}
          id={id}
          name={name}
          type="file"
          accept={
            zipOnly
              ? '.zip,application/zip,application/x-zip-compressed'
              : '.zip,.pdf,application/zip,application/x-zip-compressed,application/pdf'
          }
          multiple={!zipOnly}
          required
          data-testid={testId}
          onChange={(e) => choose([...(e.target.files ?? [])])}
          className="sr-only"
        />
      </label>
      {files.length > 0 && (
        <ul className="mt-2 grid gap-1" data-testid={testId ? `${testId}-chosen` : undefined}>
          {files.map((f) => (
            <li
              key={`${f.name}-${f.size}`}
              className="flex items-center justify-between gap-3 rounded-control bg-brand-50 px-3 py-2 text-ink-900"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-brand-600">
                  <FileIcon />
                </span>
                <span className="truncate">{f.name}</span>
              </span>
              <span className="shrink-0 text-ink-500 tabular-nums">{sizeLabel(f.size)}</span>
            </li>
          ))}
        </ul>
      )}
      {preview}
      <span className="mt-1 block text-ink-500">{hint}</span>
    </div>
  );
}
