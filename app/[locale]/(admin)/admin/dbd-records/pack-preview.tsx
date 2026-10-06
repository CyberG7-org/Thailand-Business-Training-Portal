'use client';

import { useTranslations } from 'next-intl';
import type { PackPreview } from './use-direct-upload';

/** The page name people know a Facebook page by, or the address without its scheme. */
function short(address: string): string {
  return address.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
}

/**
 * What the chosen zip holds, before anything is sent (spec 2026-10-06 §2): the counts by group,
 * the addresses found, and the reason it cannot be uploaded, when there is one.
 */
export function PackPreviewCard({ preview }: { preview: PackPreview }) {
  const t = useTranslations('admin.createDbd.packPreview');
  const te = useTranslations('admin.dbd.errors');
  return (
    <div
      data-testid="pack-preview"
      data-pack={preview.pack}
      data-invoices={preview.invoices}
      data-agreements={preview.agreements}
      data-problem={preview.problem ?? undefined}
      className="mt-2 grid gap-1 rounded-control border border-brand-100 bg-white px-3 py-2 text-ink-900"
    >
      <p className="font-semibold">{t('title', { name: preview.zipName })}</p>
      {preview.problem ? (
        <p role="alert" className="text-bad-600">
          {te(preview.problem)}
        </p>
      ) : (
        <ul className="grid gap-0.5">
          <li>{t('pack', { count: preview.pack })}</li>
          <li>{t('invoices', { count: preview.invoices })}</li>
          <li>{t('agreements', { count: preview.agreements })}</li>
          <li data-testid="pack-preview-facebook">
            {t('facebook', {
              page: preview.links.facebook ? short(preview.links.facebook) : t('none'),
            })}
          </li>
          <li data-testid="pack-preview-website">
            {t('website', {
              site: preview.links.website ? short(preview.links.website) : t('none'),
            })}
          </li>
          {preview.ignored > 0 && (
            <li className="text-ink-500">{t('ignored', { count: preview.ignored })}</li>
          )}
        </ul>
      )}
    </div>
  );
}
