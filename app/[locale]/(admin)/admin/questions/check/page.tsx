import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { listVariants } from '@/lib/db/mcq-bank';
import { contextForRecord, listRecordLearners, listVersionedCompanies } from '@/lib/db/mcq-context';
import { createSupabaseServerClient } from '@/lib/db/server';
import { conceptTitle } from '@/lib/domain/concepts/registry';
import { checkBank } from '@/lib/domain/mcq/preflight';

/**
 * What the approved bank can ask one company as its facts stand today (P17d plan decision 10):
 * per concept, the variant that would be asked, or why none can be. With a learner chosen the
 * per-learner concept is checked on their own role.
 */
export default async function CheckCompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ record?: string; learner?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  const companies = await listVersionedCompanies(db);
  const company = companies.find((c) => c.recordId === query.record) ?? null;
  const learners = company ? await listRecordLearners(db, company.recordId) : [];
  const learner = learners.find((l) => l.assignmentId === query.learner) ?? null;
  const ctx = company
    ? await contextForRecord(db, company.recordId, learner?.assignmentId ?? null)
    : null;
  const checks =
    ctx && company ? checkBank(await listVariants(db), ctx, `check:${company.recordId}`) : [];
  const usable = checks.filter((c) => c.variant).length;
  const t = await getTranslations('admin.bank');
  return (
    <section className="grid gap-4">
      <Link href="/admin/questions" className="staff-link text-sm">
        ← {t('title')}
      </Link>
      <h1 className="staff-title">{t('check.title')}</h1>
      <p className="staff-intro">{t('check.intro')}</p>

      {companies.length === 0 ? (
        <p className="staff-notice-info" data-testid="check-none">
          {t('check.none')}
        </p>
      ) : (
        <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
          <label>
            {t('check.company')}
            <select
              name="record"
              defaultValue={company?.recordId ?? ''}
              data-testid="check-company"
              className="staff-input mt-1"
            >
              <option value="">{t('check.choose')}</option>
              {companies.map((c) => (
                <option key={c.recordId} value={c.recordId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {company && (
            <label>
              {t('check.learner')}
              <select
                name="learner"
                defaultValue={learner?.assignmentId ?? ''}
                data-testid="check-learner"
                className="staff-input mt-1"
              >
                <option value="">{t('check.companyOnly')}</option>
                {learners.map((l) => (
                  <option key={l.assignmentId} value={l.assignmentId}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" data-testid="check-run" className="staff-btn-ghost staff-btn-sm">
            {t('check.run')}
          </button>
        </form>
      )}

      {checks.length > 0 && (
        <>
          <p
            className={usable === checks.length ? 'staff-notice-ok' : 'staff-notice-warn'}
            data-testid="check-summary"
            data-usable={usable}
          >
            {t('check.summary', { ok: usable, total: checks.length })}
          </p>
          <div className="staff-table-wrap">
            <table className="staff-table min-w-[46rem]">
              <thead>
                <tr>
                  <th>{t('check.columns.concept')}</th>
                  <th>{t('check.columns.variant')}</th>
                  <th>{t('check.columns.asks')}</th>
                  <th>{t('check.columns.result')}</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c, index) => (
                  <tr
                    key={c.conceptKey}
                    className="align-top"
                    data-testid={`check-${c.conceptKey}`}
                    data-state={c.variant ? 'usable' : 'blocked'}
                  >
                    <td>
                      <Link
                        href={`/admin/questions/concepts/${c.conceptKey}`}
                        className="staff-link"
                      >
                        {index + 1}. {conceptTitle(c.conceptKey, locale)}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">
                      {c.variant ? (
                        <Link
                          href={`/admin/questions/variants/${c.variant.id}`}
                          className="staff-link"
                        >
                          {c.variant.key}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="max-w-md text-sm text-ink-700">
                      {c.rendered && c.variant ? (
                        <>
                          {c.rendered.prompt}
                          <br />
                          <span className="font-semibold text-ok-600">
                            {c.rendered.options.find((o) => o.key === c.variant?.correctKey)?.text}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-sm">
                      <span className={c.variant ? 'text-ok-600' : 'text-warn-700'}>
                        {c.variant ? t('check.usable') : t('check.blocked')}
                      </span>
                      {!c.variant && c.skipped.length === 0 && <> — {t('check.noApproved')}</>}
                      {c.skipped.length > 0 && (
                        <ul className="mt-1 grid gap-1 text-ink-700">
                          {c.skipped.map((s) => (
                            <li key={s.key}>
                              {s.key}:{' '}
                              {t(`failures.${s.code}` as 'failures.missing_fact', {
                                detail: s.detail,
                              })}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
