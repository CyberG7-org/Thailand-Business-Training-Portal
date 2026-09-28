import { getTranslations } from 'next-intl/server';
import { LearnerShell } from '@/components/shell/learner-shell';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { getPolicy } from '@/lib/config/policy';
import { myUpcomingAppointment } from '@/lib/db/appointments';
import { createMyDocumentSignedUrl, getMyCompany, latestSubmittedExam } from '@/lib/db/learner';
import { loadProgressionFacts } from '@/lib/db/progression';
import { createSupabaseServerClient } from '@/lib/db/server';
import { bangkokDateOf, bangkokTimeLabel } from '@/lib/domain/appointments/slots';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import type { Director } from '@/lib/domain/dbd-record';
import { displayLoginId } from '@/lib/domain/login-id';
import { STAGE_KEYS, stageStatuses, type StageInfo, type StageKey } from '@/lib/domain/progression';
import { currentStage, doneCount } from '@/lib/domain/stage-progress';
import { formatDate } from '@/lib/domain/thai-date';
import { CompanyCard } from './company-card';
import { Hero } from './hero';
import { ProgressCard } from './progress-card';
import { STAGE_ROUTES, type StageRow } from './stage-row';
import { Stepper } from './stepper';
import { StepsList } from './steps-list';

const NUMBER_LOCALES: Record<AppLocale, string> = { th: 'th-TH', en: 'en-US', zh: 'zh-CN' };

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const [t, ts, ta, db] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('stages'),
    getTranslations('appointment'),
    createSupabaseServerClient(),
  ]);
  const loc = locale as AppLocale;

  const [mine, facts, lastExam, passMark, booking] = await Promise.all([
    getMyCompany(db, user.id),
    loadProgressionFacts(db, user.id),
    latestSubmittedExam(db, user.id),
    getPolicy('exam_passing_mark_percent'),
    myUpcomingAppointment(user.id),
  ]);
  const stages = stageStatuses(facts);
  const current = currentStage(stages);
  const done = doneCount(stages);

  const detailFor = (key: StageKey, info: StageInfo): string | null => {
    if (key === 'appointment') {
      // The booked card (spec §5.3): date, time and the manager's name.
      if (info.status === 'done' && booking) {
        return t('appointment.booked', {
          date: formatDate(bangkokDateOf(booking.starts_at), loc),
          time: bangkokTimeLabel(booking.starts_at),
          manager: booking.managerName ?? ta('booked.adminCalendar'),
        });
      }
      if (info.reason === 'before_available_from' && facts.eligibility) {
        return t('appointment.lockedUntil', {
          date: formatDate(facts.eligibility.availableFrom, loc),
        });
      }
      if (info.reason === 'missing_issue_date') return t('appointment.pending');
      if (info.status === 'available') return t('appointment.available');
    }
    if (info.reason) return ts(`reasons.${info.reason}`);
    return null;
  };
  const rows: StageRow[] = STAGE_KEYS.map((key) => {
    const info = stages[key];
    const open = info.status !== 'locked' && info.status !== 'pending';
    return {
      key,
      info,
      title: ts(`titles.${key}`),
      shortTitle: ts(`short.${key}`),
      statusLabel: ts(`status.${info.status}`),
      detail: detailFor(key, info),
      href: open ? (STAGE_ROUTES[key] ?? null) : null,
      current: key === current,
    };
  });

  // The one line under the welcome: the next step, or why it is not open yet.
  const currentRow = rows.find((r) => r.current) ?? null;
  const line = !mine
    ? t('noCompany')
    : currentRow === null
      ? t('next.done')
      : (currentRow.href === null && currentRow.detail) || t(`next.${currentRow.key}`);
  const primary =
    currentRow?.href && mine
      ? { href: currentRow.href, label: t('cta.open', { step: currentRow.title }) }
      : null;
  const secondary = lastExam
    ? { href: `/exam/${lastExam.id}/result`, label: t('cta.lastResult') }
    : null;
  const welcome = t('welcome', { name: user.displayName ?? displayLoginId(user.loginId) });

  const progress = (
    <ProgressCard
      done={done}
      total={STAGE_KEYS.length}
      ringLabel={t('progress.ring', { done, total: STAGE_KEYS.length })}
      stepsDoneLabel={t('progress.stepsDone')}
      lastScoreLabel={t('progress.lastScore')}
      lastScore={
        lastExam ? `${lastExam.score ?? 0} / ${lastExam.max_score ?? 0}` : t('progress.noExam')
      }
      passMarkLabel={t('progress.passMark')}
      passMark={`${passMark}%`}
    />
  );

  const record = mine?.dbd_records ?? null;
  const documentUrl = record ? await createMyDocumentSignedUrl(user.id, record.id) : null;
  const directors = (record?.directors as unknown as Director[] | null) ?? [];
  // What the company does and sells is the manager's answer, not a certificate fact (Level 4).
  const interview = record
    ? (readStructuredData(record.structured_data).interview ?? EMPTY_INTERVIEW_PROFILE)
    : EMPTY_INTERVIEW_PROFILE;

  return (
    <LearnerShell
      home
      hero={
        <Hero
          kicker={t('hero.kicker')}
          company={record?.company_name_th ?? null}
          welcome={welcome}
          line={line}
          lineTestId={mine ? undefined : 'no-company'}
          primary={primary}
          secondary={secondary}
        >
          {progress}
        </Hero>
      }
      bandFooter={<Stepper rows={rows} />}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <StepsList
          rows={rows}
          title={t('steps.title')}
          hint={t('steps.hint')}
          openLabel={ts('open')}
        />
        {record && (
          <CompanyCard
            labels={{
              title: t('company.title'),
              tag: t('company.tag'),
              juristicId: t('company.juristicId'),
              registeredCapital: t('company.registeredCapital'),
              address: t('company.address'),
              directors: t('company.directors'),
              issuedOn: t('company.issuedOn'),
              natureOfBusiness: t('company.natureOfBusiness'),
              productsServices: t('company.productsServices'),
              openCertificate: t('company.openCertificate'),
            }}
            nameTh={record.company_name_th ?? '—'}
            nameEn={record.company_name_en}
            juristicId={record.juristic_id ?? '—'}
            registeredCapital={
              record.registered_capital == null
                ? '—'
                : `${Number(record.registered_capital).toLocaleString(NUMBER_LOCALES[loc])} ${t('company.baht')}`
            }
            details={[
              { label: t('company.address'), value: record.head_office_address ?? '—' },
              {
                label: t('company.directors'),
                value: directors.length ? directors.map((d) => d.name_th).join(', ') : '—',
              },
              {
                label: t('company.issuedOn'),
                value: record.issued_on ? formatDate(record.issued_on, loc) : '—',
              },
              {
                label: t('company.natureOfBusiness'),
                value: interview.nature_of_business ?? '—',
                testId: 'company-nature',
              },
              {
                label: t('company.productsServices'),
                value: interview.products_services ?? '—',
                testId: 'company-products',
              },
            ]}
            documentUrl={documentUrl}
          />
        )}
      </div>
    </LearnerShell>
  );
}
