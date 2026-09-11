import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { createMyDocumentSignedUrl, getMyCompany, getMyEligibility } from '@/lib/db/learner';
import { createSupabaseServerClient } from '@/lib/db/server';
import type { Director } from '@/lib/domain/dbd-record';
import { isBankStageOpen } from '@/lib/domain/eligibility';
import { formatDate, todayInBangkok } from '@/lib/domain/thai-date';

const NUMBER_LOCALES: Record<AppLocale, string> = { th: 'th-TH', en: 'en-US', zh: 'zh-CN' };

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const t = await getTranslations('dashboard');
  const db = await createSupabaseServerClient();
  const mine = await getMyCompany(db, user.id);

  if (!mine) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">
          {t('welcome', { name: user.displayName ?? user.loginId })}
        </h1>
        <p className="mt-2" data-testid="no-company">
          {t('noCompany')}
        </p>
      </section>
    );
  }

  const record = mine.dbd_records;
  const eligibility = await getMyEligibility(db, user.id, record.id);
  const documentUrl = await createMyDocumentSignedUrl(user.id, record.id);
  const directors = (record.directors as unknown as Director[] | null) ?? [];
  const loc = locale as AppLocale;
  const open = eligibility
    ? isBankStageOpen(
        { availableFrom: eligibility.available_from, expiresAt: eligibility.expires_at },
        todayInBangkok(),
      )
    : false;

  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">
        {t('welcome', { name: user.displayName ?? user.loginId })}
      </h1>

      <div className="rounded border p-4">
        <h2 className="font-semibold">{t('company.title')}</h2>
        <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt>{t('company.name')}</dt>
          <dd data-testid="company-name">{record.company_name_th ?? '—'}</dd>
          <dt>{t('company.juristicId')}</dt>
          <dd>{record.juristic_id ?? '—'}</dd>
          <dt>{t('company.registeredCapital')}</dt>
          <dd>
            {record.registered_capital == null
              ? '—'
              : `${Number(record.registered_capital).toLocaleString(NUMBER_LOCALES[loc])} ${t('company.baht')}`}
          </dd>
          <dt>{t('company.address')}</dt>
          <dd>{record.head_office_address ?? '—'}</dd>
          <dt>{t('company.directors')}</dt>
          <dd>{directors.length ? directors.map((d) => d.name_th).join(', ') : '—'}</dd>
          <dt>{t('company.issuedOn')}</dt>
          <dd>{record.issued_on ? formatDate(record.issued_on, loc) : '—'}</dd>
        </dl>
        {documentUrl && (
          <a
            href={documentUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm underline"
          >
            {t('company.openCertificate')}
          </a>
        )}
      </div>

      <div className="rounded border p-4" data-testid="bank-stage">
        <h2 className="font-semibold">{t('bank.title')}</h2>
        {!eligibility && <p className="mt-2 text-sm">{t('bank.pending')}</p>}
        {eligibility && open && (
          <p className="mt-2 text-sm text-green-700">{t('bank.available')}</p>
        )}
        {eligibility && !open && (
          <p className="mt-2 text-sm">
            {t('bank.lockedUntil', { date: formatDate(eligibility.available_from, loc) })}
          </p>
        )}
      </div>
    </section>
  );
}
