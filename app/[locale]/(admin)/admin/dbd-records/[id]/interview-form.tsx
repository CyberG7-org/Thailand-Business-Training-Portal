import { getTranslations } from 'next-intl/server';
import type { InterviewProfile } from '@/lib/domain/bank-interview';

/** The bank figures come from the approved business category. */
export async function InterviewForm({ figures }: { figures: InterviewProfile }) {
  const t = await getTranslations('admin.dbd');
  const rows = [
    ['monthlyRevenue', figures.monthly_revenue],
    ['averagePerTransaction', figures.average_transaction],
    ['transactionsPerMonth', figures.monthly_transactions],
  ] as const;
  return (
    <section className="staff-card grid gap-4" data-testid="interview-answers">
      <h2 className="text-base font-semibold text-ink-900">{t('levels.interview')}</h2>
      <p className="text-sm text-ink-500">{t('invoiceFigures.hint')}</p>
      <dl className="grid gap-3 text-sm">
        {rows.map(([key, value]) => (
          <div key={key} className="grid gap-1 sm:grid-cols-2">
            <dt className="text-ink-500">{t(`invoiceFigures.${key}`)}</dt>
            <dd data-testid={`figure-${key}`} className="font-medium text-ink-900 tabular-nums">
              {value ?? '—'}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
