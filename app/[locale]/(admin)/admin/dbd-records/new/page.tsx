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
  return (
    <section className="grid gap-6">
      <h1 className="staff-title">Create company</h1>
      <UploadFirstForm
        extractionAvailable={Boolean(process.env.GEMINI_API_KEY)}
        zipExtractionAvailable={getDbdExtractor() !== null}
      />
    </section>
  );
}
