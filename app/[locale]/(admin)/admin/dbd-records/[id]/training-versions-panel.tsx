import { useFormatter, useTranslations } from 'next-intl';
import type { TrainingVersionRow } from '@/lib/db/training-versions';
import { versionCoverage } from '@/lib/db/training-versions';

/**
 * Which frozen copy of the facts learners are on (spec §5.6, D75): the active version, whether
 * it is complete at company scope, how many learners are behind it, and the history.
 */
export function TrainingVersionsPanel({
  versions,
  behind,
}: {
  versions: TrainingVersionRow[];
  behind: number;
}) {
  const t = useTranslations('admin.dbd.versions');
  const tf = useTranslations('admin.dbd.facts');
  const format = useFormatter();
  const active = versions.find((v) => v.status === 'active') ?? null;
  const missing = active ? versionCoverage(active).missingFacts : [];
  const when = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  return (
    <section
      className="staff-card grid max-w-2xl gap-3"
      data-testid="training-versions"
      data-active={active?.version_no ?? ''}
    >
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-sm text-ink-500">{t('intro')}</p>
      {!active ? (
        <p className="staff-notice-info" data-testid="version-none">
          {t('none')}
        </p>
      ) : (
        <>
          <p className="staff-notice-ok" data-testid="version-active">
            {t('active', { n: active.version_no, date: when(active.activated_at) })}
          </p>
          {active.company_complete ? (
            <p className="text-sm text-ok-600" data-testid="version-complete">
              {t('complete')}
            </p>
          ) : (
            <div className="grid gap-1" data-testid="version-incomplete">
              <p className="text-sm text-warn-700">{t('incomplete')}</p>
              <ul className="list-disc pl-5 text-sm">
                {missing.map((f) => (
                  <li key={f} data-fact={f}>
                    {tf(f as 'address')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-ink-700" data-testid="version-behind" data-count={behind}>
            {t('behind', { count: behind })}
          </p>
        </>
      )}
      {versions.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer text-sm font-semibold text-ink-700">
            {t('history')}
          </summary>
          <ul className="grid gap-1 text-sm tabular-nums" data-testid="version-history">
            {versions.map((v) => (
              <li key={v.id} data-version={v.version_no} data-status={v.status}>
                {v.version_no} · {t(`status.${v.status}` as 'status.active')} ·{' '}
                {when(v.activated_at)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
