import { useLocale, useTranslations } from 'next-intl';
import { conceptTitle } from '@/lib/domain/concepts/registry';
import type { Coverage } from '@/lib/domain/concepts/resolve';

/** A count as a bar: green when every concept can be asked, amber while some wait. */
function ReadyBar({ ready, total }: { ready: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((ready / total) * 100);
  return (
    <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-ink-100">
      <span
        className={`block h-full rounded-full ${ready >= total ? 'bg-ok-600' : 'bg-warn-600'}`}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

/**
 * Which concepts can already be asked (spec §7.3, D74). A record counts its company-level
 * concepts (29 / 12) and names the learner's own as checked per learner; an assignment counts
 * all 30 / 13. `compact` is the status column's version: the counts as bars, the missing facts
 * folded away.
 */
export function CoveragePanel({
  coverage,
  testId = 'coverage-panel',
  compact = false,
}: {
  coverage: Coverage;
  testId?: string;
  compact?: boolean;
}) {
  const t = useTranslations('admin.dbd.coverage');
  const tf = useTranslations('admin.dbd.facts');
  const locale = useLocale();
  const waiting = coverage.concepts.filter((c) => c.status === 'missing');
  const missing = (
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
  );
  return (
    <section
      className={`staff-card grid gap-3 ${compact ? '' : 'max-w-2xl'}`}
      data-testid={testId}
      data-scope={coverage.scope}
    >
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      {!compact && (
        <p className="text-sm text-ink-500">
          {coverage.scope === 'company' ? t('introCompany') : t('introAssignment')}
        </p>
      )}
      <dl className="grid gap-2 text-sm tabular-nums">
        <div className="grid gap-1">
          <div className="flex justify-between gap-3">
            <dt>{t('mcq')}</dt>
            <dd
              data-testid="coverage-mcq"
              data-ready={coverage.mcq.ready}
              data-total={coverage.mcq.total}
            >
              {t('count', { ready: coverage.mcq.ready, total: coverage.mcq.total })}
            </dd>
          </div>
          <ReadyBar ready={coverage.mcq.ready} total={coverage.mcq.total} />
        </div>
        <div className="grid gap-1">
          <div className="flex justify-between gap-3">
            <dt>{t('interview')}</dt>
            <dd
              data-testid="coverage-interview"
              data-ready={coverage.interview.ready}
              data-total={coverage.interview.total}
            >
              {t('count', { ready: coverage.interview.ready, total: coverage.interview.total })}
            </dd>
          </div>
          <ReadyBar ready={coverage.interview.ready} total={coverage.interview.total} />
        </div>
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
      ) : compact ? (
        <details>
          <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-brand-600">
            {t('whatIsMissing', { count: coverage.missingFacts.length })}
          </summary>
          {missing}
        </details>
      ) : (
        missing
      )}
    </section>
  );
}
