import { getTranslations } from 'next-intl/server';
import { requireStaff } from '@/lib/auth/session';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import { UploadFirstForm } from './upload-first-form';

// Upload + extraction is one long model call; allow the full serverless window.
export const maxDuration = 60;

export default async function NewDbdRecordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireStaff(locale);
  const t = await getTranslations('admin.dbd');
  return (
    <section className="grid gap-6">
      <h1 className="staff-title">{t('new')}</h1>
      <UploadFirstForm extractionAvailable={getDbdExtractor() !== null} />
    </section>
  );
}
