import { LearnerShell } from '@/components/shell/learner-shell';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ReadAloudPlayer } from '@/components/read-aloud-player';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { getPolicy } from '@/lib/config/policy';
import { cardConceptGroup } from '@/lib/content/bank-interview-cards';
import { createSupabaseAdminClient } from '@/lib/db/admin';
import { createSupabaseServerClient } from '@/lib/db/server';
import { loadCardEvidence, type Evidence } from '@/lib/db/passages';
import { getMyStudyProgress, getStudyMaterialByKey, pickLocalization } from '@/lib/db/study';
import { getActiveAssignmentForUser } from '@/lib/db/assignments';
import { toTemplateRecord } from '@/lib/db/assessment';
import { renderTemplateLenient } from '@/lib/domain/assessment/template';
import { getTtsProvider } from '@/lib/integrations/tts';
import { getVectorStore } from '@/lib/integrations/vector';
import { markCompletedAction } from '../actions';
import { ViewTracker } from '../view-tracker';

export default async function StudyMaterialPage({
  params,
}: {
  params: Promise<{ locale: string; key: string }>;
}) {
  const { locale, key } = await params;
  const user = await requireUser(locale);
  const db = await createSupabaseServerClient();
  const material = await getStudyMaterialByKey(db, key);
  if (!material) notFound();
  const t = await getTranslations('study');
  const loc = pickLocalization(material, locale as AppLocale);

  if (!loc) {
    return (
      <LearnerShell title={t('title')} step="study">
        <section className="grid gap-4">
          <Link href="/study" className="text-sm underline">
            ← {t('title')}
          </Link>
          <p data-testid="study-not-available">{t('notAvailable')}</p>
        </section>
      </LearnerShell>
    );
  }

  const [progress, completionTracking, assignment] = await Promise.all([
    getMyStudyProgress(db, user.id),
    getPolicy('study_completion_tracking'),
    getActiveAssignmentForUser(db, user.id),
  ]);
  // Cards may carry {placeholders}: each learner reads their own company facts (decision D39).
  const templateRecord = assignment ? toTemplateRecord(assignment.dbd_records, assignment) : null;
  const body = renderTemplateLenient(loc.body ?? '', templateRecord, locale as AppLocale);

  // "From your documents" (spec §8, D44): passages of the learner's OWN record for this card's
  // concepts. The assignment is the ownership check; names are read with the service role because
  // learners cannot read dbd_documents.
  const group = cardConceptGroup(material.content_key);
  let evidence: Evidence[] = [];
  if (group && assignment) {
    try {
      evidence = await loadCardEvidence(
        createSupabaseAdminClient(),
        getVectorStore(),
        assignment.dbd_record_id,
        group,
      );
    } catch (e) {
      console.error('study evidence unavailable', e);
    }
  }
  const mine = progress.find((p) => p.material_id === material.id) ?? null;
  const ttsAvailable = locale === 'th' && loc.tts_enabled && getTtsProvider() !== null;

  let pdfUrl: string | null = null;
  if (material.type === 'pdf' && loc.file_path) {
    const { data } = await createSupabaseAdminClient()
      .storage.from('study-materials')
      .createSignedUrl(loc.file_path, 300);
    pdfUrl = data?.signedUrl ?? null;
  }

  return (
    <LearnerShell title={loc.title} titleTestId="study-title" step="study">
      <section className="grid gap-4">
        <ViewTracker materialId={material.id} />
        <Link href="/study" className="text-sm underline">
          ← {t('title')}
        </Link>
        {ttsAvailable && (
          <ReadAloudPlayer
            materialId={material.id}
            labels={{
              play: t('readAloud.play'),
              pause: t('readAloud.pause'),
              loading: t('readAloud.loading'),
              error: t('readAloud.error'),
            }}
          />
        )}
        {material.type === 'card' && (
          <article className="prose max-w-2xl" data-testid="study-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </article>
        )}
        {evidence.length > 0 && (
          <aside className="max-w-2xl rounded border bg-gray-50 p-4" data-testid="study-evidence">
            <h2 className="text-sm font-semibold">{t('evidence.title')}</h2>
            <p className="text-xs text-gray-600">{t('evidence.hint')}</p>
            <ol className="mt-2 grid gap-2">
              {evidence.map((e, i) => (
                <li key={i} className="rounded border bg-white p-2 text-sm">
                  <p className="text-xs text-gray-500">
                    {t('evidence.source', { document: e.document, page: e.page })}
                  </p>
                  <p className="whitespace-pre-wrap">{e.text}</p>
                </li>
              ))}
            </ol>
          </aside>
        )}
        {material.type === 'pdf' &&
          (pdfUrl ? (
            <div className="grid gap-2">
              <iframe src={pdfUrl} title={loc.title} className="h-[70vh] w-full rounded border" />
              <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-sm underline">
                {t('openPdf')}
              </a>
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t('pdfMissing')}</p>
          ))}
        {completionTracking === 'completed' && (
          <form action={markCompletedAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="materialId" value={material.id} />
            <input type="hidden" name="contentKey" value={material.content_key} />
            {mine?.completed_at ? (
              <p className="text-sm text-green-700" data-testid="study-completed">
                {t('completed')}
              </p>
            ) : (
              <button type="submit" className="rounded bg-gray-900 px-4 py-2 text-sm text-white">
                {t('markCompleted')}
              </button>
            )}
          </form>
        )}
      </section>
    </LearnerShell>
  );
}
