import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';
import { listDbdRecords } from '@/lib/db/dbd-records';
import { createSupabaseServerClient } from '@/lib/db/server';
import { listStudyMaterials } from '@/lib/db/study';
import { resolveQuestionGenProvider } from '@/lib/integrations/question-gen';
import { GenerateForm } from './generate-form';

// Generation is one long model call; allow the full serverless window (Vercel Hobby limit).
// One batch is a single long Opus call (three languages per question): allow the full window
// a Vercel function may take, and keep batches small enough to fit it (MAX_COUNT).
export const maxDuration = 300;

export default async function GenerateQuestionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireStaff(locale);
  const db = await createSupabaseServerClient();
  const [materials, records] = await Promise.all([listStudyMaterials(db), listDbdRecords(db)]);
  const references = records
    .filter((r) => r.extraction_status === 'confirmed')
    .map((r) => ({
      id: r.id,
      label: `${r.company_name_th ?? r.company_name_en ?? r.id} · ${r.juristic_id ?? '—'}${r.document_path ? ' · PDF' : ''}`,
    }));
  const cards = materials
    .filter((m) => m.type === 'card' && m.active)
    .map((m) => {
      const loc =
        m.study_material_localizations.find((l) => l.language === locale) ??
        m.study_material_localizations.find((l) => l.language === 'th') ??
        m.study_material_localizations[0];
      return { id: m.id, title: loc?.title ?? m.content_key };
    });
  const provider = resolveQuestionGenProvider();
  const t = await getTranslations('admin.generate');
  return (
    <section className="grid gap-4">
      <Link href="/admin/questions" className="staff-link text-sm">
        ← {t('back')}
      </Link>
      <h1 className="staff-title">{t('title')}</h1>
      <p className="staff-intro">{t('intro')}</p>
      {provider === 'off' ? (
        <p data-testid="generate-off" className="staff-notice-info max-w-2xl">
          {t('errors.not_configured')}
        </p>
      ) : (
        <>
          {provider === 'fake' && (
            <p className="staff-notice-warn max-w-2xl text-xs">{t('fakeNotice')}</p>
          )}
          <GenerateForm cards={cards} references={references} />
        </>
      )}
    </section>
  );
}
