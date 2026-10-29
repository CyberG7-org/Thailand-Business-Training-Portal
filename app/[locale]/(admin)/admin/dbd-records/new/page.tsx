import { requireStaff } from '@/lib/auth/session';
import { getTranslations } from 'next-intl/server';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import { companyPdfAvailable } from '@/lib/integrations/extraction/company-pdf';
import { UploadFirstForm } from './upload-first-form';
import { pageTitle } from '@/i18n/page-title';

export const generateMetadata = pageTitle('admin.dbd', 'title');

// Upload + extraction is one long model call; allow the full serverless window.
export const maxDuration = 180;

export default async function NewDbdRecordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireStaff(locale);
  const t = await getTranslations('admin.dbd.uploadChoice');
  return (
    <section className="grid gap-6">
      <h1 className="staff-title">{t('createCompany')}</h1>
      <UploadFirstForm
        extractionAvailable={Boolean(process.env.GEMINI_API_KEY)}
        pdfExtractionAvailable={companyPdfAvailable()}
        zipExtractionAvailable={getDbdExtractor() !== null}
      />
    </section>
  );
}
