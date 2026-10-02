import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { MCQ_STARTER } from '@/lib/content/mcq-starter';
import { isCheckedDraft, listVariants } from '@/lib/db/mcq-bank';
import { createSupabaseServerClient } from '@/lib/db/server';
import { conceptTitle, MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import { bankCoverage } from '@/lib/domain/mcq/coverage';
import type { AppliesWhen } from '@/lib/domain/mcq/variant';
import { ApproveDraftsForm, StarterForm } from './bank-forms';

/** The Owner's bank, concept first (P17d): thirty concepts and what each still lacks. */
export default async function QuestionBankPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAdmin(locale);
  const variants = await listVariants(await createSupabaseServerClient());
  const coverage = bankCoverage(variants);
  const held = new Set(variants.map((v) => v.key));
  const startersMissing = MCQ_STARTER.filter((s) => !held.has(s.key)).length;
  const checkedDrafts = variants.filter(isCheckedDraft).length;
  const t = await getTranslations('admin.bank');
  const caseLabel = (when: AppliesWhen | null) =>
    when === null
      ? t('caseAlways')
      : t(when.value ? 'caseYes' : 'caseNo', {
          fact: t(`statusFacts.${when.fact}` as 'statusFacts.operations_started'),
        });
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="staff-title">{t('title')}</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/questions/check"
            data-testid="bank-check"
            className="staff-btn-ghost staff-btn-sm"
          >
            {t('checkCompany')}
          </Link>
          <Link
            href="/admin/questions/legacy"
            data-testid="bank-legacy"
            className="staff-btn-ghost staff-btn-sm"
          >
            {t('legacy')}
          </Link>
        </div>
      </div>
      <p className="staff-intro">{t('intro')}</p>
      <p
        className={coverage.ready === coverage.total ? 'staff-notice-ok' : 'staff-notice-info'}
        data-testid="bank-ready"
        data-ready={coverage.ready}
      >
        {t('ready', { ready: coverage.ready, total: coverage.total })}
      </p>
      {startersMissing > 0 && <StarterForm count={startersMissing} />}
      <ApproveDraftsForm count={checkedDrafts} />

      <div className="staff-table-wrap">
        <table className="staff-table min-w-[46rem]">
          <thead>
            <tr>
              <th>{t('columns.order')}</th>
              <th>{t('columns.concept')}</th>
              <th>{t('columns.source')}</th>
              <th>{t('columns.cases')}</th>
              <th>{t('columns.variants')}</th>
            </tr>
          </thead>
          <tbody>
            {coverage.concepts.map((c) => {
              const def = MCQ_CONCEPTS.find((d) => d.key === c.conceptKey)!;
              return (
                <tr
                  key={c.conceptKey}
                  className="align-top"
                  data-testid={`concept-${c.conceptKey}`}
                  data-covered={c.covered}
                >
                  <td className="tabular-nums">{def.mcqOrder}</td>
                  <td>
                    <Link href={`/admin/questions/concepts/${c.conceptKey}`} className="staff-link">
                      {conceptTitle(c.conceptKey, locale)}
                    </Link>
                    {def.critical && <span className="staff-tag ml-1">{t('critical')}</span>}
                  </td>
                  <td>{t(`sources.${def.source}` as 'sources.DBD_FACT')}</td>
                  <td>
                    <ul className="grid gap-1 text-sm">
                      {c.cases.map((k) => (
                        <li
                          key={k.when ? `${k.when.fact}:${k.when.value}` : 'always'}
                          className={k.approved > 0 ? 'text-ok-600' : 'text-warn-700'}
                        >
                          {caseLabel(k.when)} — {k.approved > 0 ? t('covered') : t('uncovered')}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="text-sm text-ink-700">{t('counts', c.counts)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
