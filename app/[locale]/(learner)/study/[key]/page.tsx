import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CheckIcon } from '@/components/icons';
import { ReadAloudPlayer } from '@/components/read-aloud-player';
import { LearnerShell } from '@/components/shell/learner-shell';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { getPolicy } from '@/lib/config/policy';
import { cardConceptGroup } from '@/lib/content/bank-interview-cards';
import { createSupabaseAdminClient } from '@/lib/db/admin';
import { createSupabaseServerClient } from '@/lib/db/server';
import { loadCardEvidence, type Evidence } from '@/lib/db/passages';
import { getMyStudyProgress, listStudyMaterials, pickLocalization } from '@/lib/db/study';
import { getActiveAssignmentForUser } from '@/lib/db/assignments';
import { toTemplateRecord } from '@/lib/db/assessment';
import { pinnedFactsFor } from '@/lib/db/pinning';
import { templateRecordFromSnapshot } from '@/lib/domain/facts/snapshot';
import { renderTemplateLenient } from '@/lib/domain/assessment/template';
import { getTtsProvider } from '@/lib/integrations/tts';
import { getVectorStore } from '@/lib/integrations/vector';
import { markCompletedAction } from '../actions';
import { ViewTracker } from '../view-tracker';

type SegmentState = 'done' | 'viewed' | 'current' | 'new';
const SEGMENT: Record<SegmentState, string> = {
  done: 'bg-gold-500',
  viewed: 'bg-brand-600',
  current: 'bg-white',
  new: 'bg-white/25',
};

/** "Card n of N" and one segment per card, on the band where the step segments usually sit. */
function CardSegments({ label, states }: { label: string; states: SegmentState[] }) {
  return (
    <div
      data-testid="card-segments"
      className="flex items-center gap-3 text-sm font-medium text-brand-100 tabular-nums"
    >
      <span>{label}</span>
      <div className="flex flex-wrap gap-1" aria-hidden="true">
        {states.map((state, i) => (
          <span key={i} data-state={state} className={'h-1 w-7 rounded-sm ' + SEGMENT[state]} />
        ))}
      </div>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/**
 * One study card (design handoff, 02): the article with the card's own table and tips, a footer
 * that marks it done (under "completed" tracking) and leads to the next card, and the learner's
 * own document passages beside it. The band says which card this is.
 */
export default async function StudyMaterialPage({
  params,
}: {
  params: Promise<{ locale: string; key: string }>;
}) {
  const { locale, key } = await params;
  const user = await requireUser(locale);
  const db = await createSupabaseServerClient();
  const loc = locale as AppLocale;
  const [materials, t] = await Promise.all([listStudyMaterials(db), getTranslations('study')]);
  const index = materials.findIndex((m) => m.content_key === key);
  if (index < 0) notFound();
  const material = materials[index];
  const localization = pickLocalization(material, loc);
  if (!localization) {
    return (
      <LearnerShell title={t('title')} step="study" hideBack headerVariant="study">
        <div className="grid gap-5">
          <section className="rounded-card bg-white px-6 py-5 shadow-raised">
            <p data-testid="study-not-available" className="text-sm text-ink-700">
              {t('notAvailable')}
            </p>
          </section>
        </div>
      </LearnerShell>
    );
  }

  const [progress, completionTracking, assignment] = await Promise.all([
    getMyStudyProgress(db, user.id),
    getPolicy('study_completion_tracking'),
    getActiveAssignmentForUser(db, user.id),
  ]);
  // Cards may carry {placeholders}: each learner reads their own company facts (decision D39).
  // The pinned version (D75); the live row only while the record has no version yet.
  const pinned = assignment ? await pinnedFactsFor(createSupabaseAdminClient(), assignment) : null;
  const templateRecord = pinned
    ? templateRecordFromSnapshot(pinned.snapshot, pinned.role)
    : assignment
      ? toTemplateRecord(assignment.dbd_records, assignment)
      : null;
  const body = renderTemplateLenient(localization.body ?? '', templateRecord, loc);

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
  const progressById = new Map(progress.map((p) => [p.material_id, p]));
  const mine = progressById.get(material.id) ?? null;
  const ttsAvailable = loc === 'th' && localization.tts_enabled && getTtsProvider() !== null;

  // Where this card sits in the list, with the same notion of "done" as the list itself.
  const states: SegmentState[] = materials.map((m, i) => {
    if (i === index) return 'current';
    const p = progressById.get(m.id);
    if (p?.completed_at || (completionTracking === 'viewed' && p)) return 'done';
    return p ? 'viewed' : 'new';
  });
  const total = materials.length;
  const previousMaterial = materials
    .slice(0, index)
    .reverse()
    .find((m) => pickLocalization(m, loc) !== null);
  const previous = previousMaterial
    ? { key: previousMaterial.content_key, index: materials.indexOf(previousMaterial) + 1 }
    : null;
  const nextMaterial = materials.slice(index + 1).find((m) => pickLocalization(m, loc) !== null);
  const next = nextMaterial
    ? {
        key: nextMaterial.content_key,
        index: materials.indexOf(nextMaterial) + 1,
        title: pickLocalization(nextMaterial, loc)?.title ?? '',
      }
    : null;

  let pdfUrl: string | null = null;
  if (material.type === 'pdf' && localization.file_path) {
    const { data } = await createSupabaseAdminClient()
      .storage.from('study-materials')
      .createSignedUrl(localization.file_path, 300);
    pdfUrl = data?.signedUrl ?? null;
  }

  const footerLink =
    'inline-flex min-h-11 items-center gap-2 text-base font-medium text-brand-700 transition-colors hover:text-brand-900';

  return (
    <LearnerShell
      step="study"
      hideBack
      headerVariant="study"
      subBarRight={<CardSegments label={t('cardOf', { n: index + 1, total })} states={states} />}
      hero={
        <>
          <h1
            data-testid="study-title"
            className="mt-6 max-w-4xl font-display text-[26px] leading-[1.35] font-medium text-white md:text-[32px]"
          >
            {localization.title}
          </h1>
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
        </>
      }
    >
      <ViewTracker materialId={material.id} />
      {/* The card first, then what the documents say about it (the owner, 2026-10-02). */}
      <div className="grid gap-6">
        <article className="rise rounded-card bg-white px-5 py-6 shadow-raised md:px-9 md:py-8">
          {material.type === 'card' && (
            <div className="study-article" data-testid="study-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
            </div>
          )}
          {material.type === 'pdf' &&
            (pdfUrl ? (
              <div className="grid gap-3">
                <iframe
                  src={pdfUrl}
                  title={localization.title}
                  className="h-[70vh] w-full rounded-control border border-ink-300"
                />
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 w-fit items-center rounded-control border border-ink-300 bg-white px-4 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
                >
                  {t('openPdf')}
                </a>
              </div>
            ) : (
              <p className="rounded-control bg-warn-50 px-3.5 py-2.5 text-sm font-medium text-warn-700">
                {t('pdfMissing')}
              </p>
            ))}
          {(completionTracking === 'completed' || previous || next) && (
            <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-ink-100 pt-6">
              {previous && (
                <Link
                  data-testid="study-previous"
                  href={'/study/' + previous.key}
                  className="inline-flex min-h-11 items-center gap-2 rounded-control border border-brand-100 px-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
                >
                  <span className="rotate-180">
                    <ArrowIcon />
                  </span>
                  {t('previousCard', { n: previous.index })}
                </Link>
              )}
              {completionTracking === 'completed' ? (
                <form action={markCompletedAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="materialId" value={material.id} />
                  <input type="hidden" name="contentKey" value={material.content_key} />
                  {mine?.completed_at ? (
                    <p
                      data-testid="study-completed"
                      className="inline-flex min-h-11 items-center gap-2 rounded-control bg-ok-50 px-3.5 text-sm font-medium text-ok-600"
                    >
                      <CheckIcon size={16} />
                      {t('completed')}
                    </p>
                  ) : (
                    <button
                      type="submit"
                      className="inline-flex min-h-12 items-center gap-2 rounded-control bg-brand-600 px-6 text-base font-semibold text-white transition-colors hover:bg-brand-700"
                    >
                      <CheckIcon size={16} />
                      {t('markCompleted')}
                    </button>
                  )}
                </form>
              ) : null}
              {next && (
                <Link
                  data-testid="study-next"
                  href={'/study/' + next.key}
                  className={`${footerLink} ml-auto`}
                >
                  {t('nextCard', { n: next.index, title: next.title })}
                  <ArrowIcon />
                </Link>
              )}
            </footer>
          )}
        </article>

        {evidence.length > 0 && (
          <aside
            data-testid="study-evidence"
            className="rise overflow-hidden rounded-sheet bg-white shadow-raised"
            style={{ '--rise-delay': '100ms' } as CSSProperties}
          >
            <div className="card-hero px-5 py-4 text-white md:px-6">
              <h2 className="font-display text-[20px] leading-[1.5] font-semibold">
                {t('evidence.title')}
              </h2>
              <p className="mt-1 text-sm leading-[1.7] text-brand-100">{t('evidence.hint')}</p>
            </div>
            <ol className="grid gap-2.5 p-4 md:grid-cols-2 md:p-5">
              {evidence.map((e, i) => (
                <li key={i} className="rounded-control border border-ink-100 px-3.5 py-3">
                  <p className="mb-1 text-sm leading-[1.6] font-medium text-ink-500">
                    {t('evidence.source', { document: e.document, page: e.page })}
                  </p>
                  <p className="text-sm leading-[1.75] whitespace-pre-wrap">{e.text}</p>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>
    </LearnerShell>
  );
}
