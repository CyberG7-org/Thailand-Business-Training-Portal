import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { listGenerationBatches } from '@/lib/db/question-gen';
import { listQuestions } from '@/lib/db/questions';
import { createSupabaseServerClient } from '@/lib/db/server';
import type { SourceRef } from '@/lib/integrations/question-gen/passages';
import { approveQuestionAction } from './actions';

const STATUSES = ['draft', 'approved', 'retired'] as const;

export default async function QuestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ batch?: string; status?: string }>;
}) {
  const { locale } = await params;
  const { batch, status } = await searchParams;
  await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  const [all, batches] = await Promise.all([listQuestions(db), listGenerationBatches(db)]);
  const questions = all.filter(
    (q) => (!batch || q.generation_batch_id === batch) && (!status || q.approval_status === status),
  );
  const currentBatch = batch ? batches.find((b) => b.id === batch) : undefined;
  const t = await getTranslations('admin.questions');
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/questions/generate"
            data-testid="generate-link"
            className="rounded border px-3 py-1 text-sm"
          >
            {t('generate')}
          </Link>
          <Link
            href="/admin/questions/new"
            className="rounded bg-gray-900 px-3 py-1 text-sm text-white"
          >
            {t('new')}
          </Link>
        </div>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <label>
          {t('status')}
          <select
            name="status"
            defaultValue={status ?? ''}
            className="mt-1 block rounded border px-2 py-1"
          >
            <option value="">{t('all')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('batch')}
          <select
            name="batch"
            defaultValue={batch ?? ''}
            className="mt-1 block rounded border px-2 py-1"
          >
            <option value="">{t('all')}</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {new Date(b.created_at).toLocaleString(locale)} · {b.material_summary} ({b.produced}
                )
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded border px-3 py-1">
          {t('filter')}
        </button>
      </form>

      {currentBatch && (
        <p className="text-sm text-gray-700" data-testid="batch-summary">
          {t('batchSummary', {
            produced: currentBatch.produced,
            rejected: currentBatch.rejected,
            provider: currentBatch.provider,
          })}
        </p>
      )}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">{t('key')}</th>
            <th>{t('preview')}</th>
            <th>{t('kind')}</th>
            <th>{t('pools')}</th>
            <th>{t('status')}</th>
            <th>{t('languages')}</th>
            <th>{t('sources')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => {
            const preview =
              q.question_localizations.find((l) => l.language === locale) ??
              q.question_localizations.find((l) => l.language === 'th') ??
              q.question_localizations[0];
            const languages = q.question_localizations.map((l) => l.language).sort();
            return (
              <tr
                key={q.id}
                className="border-b align-top"
                data-testid={`question-${q.question_key}`}
              >
                <td className="py-2 whitespace-nowrap">
                  <Link href={`/admin/questions/${q.id}`} className="underline">
                    {q.question_key}
                  </Link>
                  {q.source === 'ai_generated' && (
                    <span className="ml-1 rounded bg-gray-100 px-1 text-xs">AI</span>
                  )}
                </td>
                <td className="max-w-md truncate text-gray-700">{preview?.prompt ?? '—'}</td>
                <td>{q.kind}</td>
                <td>{q.pools.join(', ')}</td>
                <td data-testid="row-status">{q.approval_status}</td>
                <td>{languages.join(', ') || '—'}</td>
                <td data-testid="question-sources" className="text-xs text-gray-600">
                  {(q.source_refs as unknown as SourceRef[]).map((r, i) => (
                    <span key={i} className="mr-1 rounded bg-gray-100 px-1">
                      {t('sourceRef', { document: r.document_name, page: r.page })}
                    </span>
                  ))}
                </td>
                <td>
                  {q.approval_status === 'draft' && languages.length === 3 && (
                    <form action={approveQuestionAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="questionId" value={q.id} />
                      <input type="hidden" name="batch" value={batch ?? ''} />
                      <input type="hidden" name="status" value={status ?? ''} />
                      <button
                        type="submit"
                        data-testid="approve-row"
                        className="rounded border px-2 py-0.5 text-xs"
                      >
                        {t('approve')}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
