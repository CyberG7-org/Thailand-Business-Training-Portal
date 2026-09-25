import { LearnerShell } from '@/components/shell/learner-shell';
import { displayLoginId } from '@/lib/domain/login-id';
import { getTranslations } from 'next-intl/server';
import { StageCard } from '@/components/stage-card';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { createMyDocumentSignedUrl, getMyCompany } from '@/lib/db/learner';
import { loadProgressionFacts } from '@/lib/db/progression';
import { createSupabaseServerClient } from '@/lib/db/server';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import type { Director } from '@/lib/domain/dbd-record';
import { STAGE_KEYS, stageStatuses, type StageInfo, type StageKey } from '@/lib/domain/progression';
import { formatDate } from '@/lib/domain/thai-date';

const NUMBER_LOCALES: Record<AppLocale, string> = { th: 'th-TH', en: 'en-US', zh: 'zh-CN' };

/** Routes exist only for stages whose slice has shipped; the rest show status without a link. */
const STAGE_ROUTES: Partial<Record<StageKey, string>> = {
  study: '/study',
  quiz: '/quiz',
  exam: '/exam',
  nameCard: '/name-card',
  bank: '/bank-call',
};

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const t = await getTranslations('dashboard');
  const ts = await getTranslations('stages');
  const db = await createSupabaseServerClient();
  const loc = locale as AppLocale;

  const [mine, facts] = await Promise.all([
    getMyCompany(db, user.id),
    loadProgressionFacts(db, user.id),
  ]);
  const stages = stageStatuses(facts);

  const detailFor = (key: StageKey, info: StageInfo): string | null => {
    if (key === 'bank') {
      if (info.reason === 'before_available_from' && facts.eligibility) {
        return t('bank.lockedUntil', { date: formatDate(facts.eligibility.availableFrom, loc) });
      }
      if (info.reason === 'missing_issue_date') return t('bank.pending');
      if (info.status === 'available') return t('bank.available');
    }
    if (info.reason) return ts(`reasons.${info.reason}`);
    return null;
  };

  const stageCards = (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {STAGE_KEYS.map((key) => {
        const info = stages[key];
        const href =
          info.status === 'locked' || info.status === 'pending'
            ? null
            : (STAGE_ROUTES[key] ?? null);
        return (
          <StageCard
            key={key}
            stage={key}
            info={info}
            title={ts(`titles.${key}`)}
            statusLabel={ts(`status.${info.status}`)}
            detail={detailFor(key, info)}
            href={href}
            actionLabel={ts('open')}
          />
        );
      })}
    </div>
  );

  const welcome = t('welcome', { name: user.displayName ?? displayLoginId(user.loginId) });

  if (!mine) {
    return (
      <LearnerShell title={welcome} home>
        <section className="grid gap-6">
          <p data-testid="no-company">{t('noCompany')}</p>
          {stageCards}
        </section>
      </LearnerShell>
    );
  }

  const record = mine.dbd_records;
  const documentUrl = await createMyDocumentSignedUrl(user.id, record.id);
  const directors = (record.directors as unknown as Director[] | null) ?? [];
  // What the company does and sells is the manager's answer, not a certificate fact (Level 4).
  const interview = readStructuredData(record.structured_data).interview ?? EMPTY_INTERVIEW_PROFILE;

  return (
    <LearnerShell title={welcome} home>
      <section className="grid gap-6">
        {stageCards}

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
            <dt>{t('company.natureOfBusiness')}</dt>
            <dd data-testid="company-nature">{interview.nature_of_business ?? '—'}</dd>
            <dt>{t('company.productsServices')}</dt>
            <dd data-testid="company-products">{interview.products_services ?? '—'}</dd>
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
      </section>
    </LearnerShell>
  );
}
