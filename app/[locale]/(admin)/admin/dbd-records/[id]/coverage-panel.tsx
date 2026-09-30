import { useLocale, useTranslations } from 'next-intl';
import { conceptTitle } from '@/lib/domain/concepts/registry';
import type { Coverage } from '@/lib/domain/concepts/resolve';

/**
 * Which concepts can already be asked (spec §7.3, D74). A record counts its company-level
 * concepts (29 / 12) and names the learner's own as checked per learner; an assignment counts
 * all 30 / 13. Informational until P17c gates on it.
 */
export function CoveragePanel({
  coverage,
  testId = 'coverage-panel',
}: {
  coverage: Coverage;
  testId?: string;
}) {
  const t = useTranslations('admin.dbd.coverage');
  const tf = useTranslations('admin.dbd.facts');
  const locale = useLocale();
  const waiting = coverage.concepts.filter((c) => c.status === 'missing');
  return (
    <section
      className="staff-card grid max-w-2xl gap-3"
      data-testid={testId}
      data-scope={coverage.scope}
    >
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-sm text-ink-500">
        {coverage.scope === 'company' ? t('introCompany') : t('introAssignment')}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm tabular-nums">
        <dt>{t('mcq')}</dt>
        <dd
          data-testid="coverage-mcq"
          data-ready={coverage.mcq.ready}
          data-total={coverage.mcq.total}
        >
          {t('count', { ready: coverage.mcq.ready, total: coverage.mcq.total })}
        </dd>
        <dt>{t('interview')}</dt>
        <dd
          data-testid="coverage-interview"
          data-ready={coverage.interview.ready}
          data-total={coverage.interview.total}
        >
          {t('count', { ready: coverage.interview.ready, total: coverage.interview.total })}
        </dd>
      </dl>
      {coverage.perLearner.length > 0 && (
        <p className="text-sm text-ink-500" data-testid="coverage-per-learner">
          {t('perLearner', {
            list: coverage.perLearner.map((k) => conceptTitle(k, locale)).join(', '),
          })}
        </p>
      )}
      {waiting.length === 0 ? (
        <p className="staff-notice-ok" data-testid="coverage-complete">
          {t('allReady')}
        </p>
      ) : (
        <div className="grid gap-1">
          <p className="text-sm font-semibold">{t('missingFacts')}</p>
          <ul className="list-disc pl-5 text-sm" data-testid="coverage-missing">
            {coverage.missingFacts.map((f) => (
              <li key={f} data-fact={f}>
                {tf(f as 'address')}
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-500">
            {t('missingConcepts', {
              list: waiting.map((c) => conceptTitle(c.key, locale)).join(', '),
            })}
          </p>
        </div>
      )}
    </section>
  );
}
