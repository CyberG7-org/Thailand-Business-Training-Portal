import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { getDbdRecord } from '@/lib/db/dbd-records';
import { createSupabaseServerClient } from '@/lib/db/server';
import { extractionToFormValues, type ExtractionSuggestions } from '@/lib/domain/extraction-merge';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import { dbdExtractionSchema } from '@/lib/integrations/extraction/schema';
import { DbdRecordForm } from '../dbd-record-form';
import { RecordTools } from './record-tools';

// Upload + extraction run inside the page's server actions; allow the full serverless window.
export const maxDuration = 60;

export default async function DbdRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ extraction?: string; applied?: string; extractionError?: string }>;
}) {
  const { locale, id } = await params;
  const { extraction, applied, extractionError } = await searchParams;
  await requireAdmin(locale);
  const record = await getDbdRecord(await createSupabaseServerClient(), id);
  if (!record) notFound();
  const t = await getTranslations('admin.dbd');

  // Suggestions only pre-fill the form; the stored extraction is validated before use.
  let suggestions: ExtractionSuggestions | null = null;
  if (record.extraction_raw && record.extraction_status !== 'confirmed') {
    const parsed = dbdExtractionSchema.safeParse(record.extraction_raw);
    if (parsed.success) suggestions = extractionToFormValues(parsed.data);
  }

  return (
    <section className="grid gap-6">
      <Link href="/admin/dbd-records" className="text-sm underline">
        ← {t('title')}
      </Link>
      <h1 className="text-2xl font-semibold">{record.company_name_th ?? t('untitled')}</h1>
      <RecordTools
        id={record.id}
        status={record.extraction_status}
        documentPath={record.document_path}
        extractionAvailable={getDbdExtractor() !== null}
      />
      {extraction === 'filled' && (
        <p
          data-testid="autofill-banner"
          className="max-w-2xl rounded border border-green-300 bg-green-50 p-3 text-sm"
        >
          {t('autoFilledReview', { count: Number(applied ?? 0) })}
        </p>
      )}
      {extraction === 'failed' && (
        <p
          data-testid="autofill-banner"
          className="max-w-2xl rounded border border-amber-300 bg-amber-50 p-3 text-sm"
        >
          {t('uploadedButNotRead', { reason: extractionError ?? '' })}
        </p>
      )}
      {extraction === 'skipped' && (
        <p
          data-testid="autofill-banner"
          className="max-w-2xl rounded border bg-gray-50 p-3 text-sm"
        >
          {t('extractionNotConfigured')}
        </p>
      )}
      {suggestions && extraction !== 'filled' && (
        <p className="max-w-2xl rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          {t('reviewSuggestions')}
        </p>
      )}
      <DbdRecordForm record={record} suggestions={suggestions} />
    </section>
  );
}
