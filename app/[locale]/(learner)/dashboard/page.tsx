import { getTranslations } from 'next-intl/server';
import { LearnerShell } from '@/components/shell/learner-shell';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { getPolicy } from '@/lib/config/policy';
import { createMyDocumentSignedUrl, getMyCompany, latestSubmittedExam } from '@/lib/db/learner';
import { refreshNameCard } from '@/lib/db/name-cards';
import { loadProgressionFacts } from '@/lib/db/progression';
import { createSupabaseAdminClient } from '@/lib/db/admin';
import { pinnedFactsFor } from '@/lib/db/pinning';
import { createSupabaseServerClient } from '@/lib/db/server';
import { MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { EMPTY_BUSINESS_PROFILE, readStructuredData } from '@/lib/domain/dbd-profile';
import type { Director } from '@/lib/domain/dbd-record';
import { displayLoginId } from '@/lib/domain/login-id';
import { stageStatuses, type StageInfo } from '@/lib/domain/progression';
import { LEARNER_STAGES, currentStage } from '@/lib/domain/stage-progress';
import { formatDate } from '@/lib/domain/thai-date';
import { CompanyCard, type CompanyDetail } from './company-card';
import { Hero } from './hero';
import { ProgressCard } from './progress-card';
import { STAGE_ROUTES, type StageRow } from './stage-row';
import { Stepper } from './stepper';
import { StepsList } from './steps-list';

const NUMBER_LOCALES: Record<AppLocale, string> = { th: 'th-TH', en: 'en-US', zh: 'zh-CN' };
const DASHBOARD_STAGES = LEARNER_STAGES.filter((key) => key !== 'appointment');

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const [t, ts, db] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('stages'),
    createSupabaseServerClient(),
  ]);
  const loc = locale as AppLocale;
  // The name card is made for the learner (D96); a learner created before it was, or whose
  // details changed, gets theirs here, so the step reads done.
  await refreshNameCard(user.id);

  const [mine, facts, lastExam, passMark] = await Promise.all([
    getMyCompany(db, user.id),
    loadProgressionFacts(db, user.id, { language: locale }),
    latestSubmittedExam(db, user.id),
    getPolicy('mcq_pass_score'),
  ]);
  const stages = stageStatuses(facts);
  const progressionCurrent = currentStage(stages);
  const current = progressionCurrent === 'appointment' ? null : progressionCurrent;
  const done = DASHBOARD_STAGES.filter((key) => stages[key].status === 'done').length;

  const detailFor = (info: StageInfo): string | null => {
    if (info.reason) return ts(`reasons.${info.reason}`);
    return null;
  };
  const rows: StageRow[] = DASHBOARD_STAGES.map((key) => {
    const info = stages[key];
    const open = info.status !== 'locked' && info.status !== 'pending';
    return {
      key,
      info,
      title: ts(`titles.${key}`),
      shortTitle: ts(`short.${key}`),
      statusLabel: ts(`status.${info.status}`),
      detail: detailFor(info),
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
      total={DASHBOARD_STAGES.length}
      ringLabel={t('progress.ring', { done, total: DASHBOARD_STAGES.length })}
      stepsDoneLabel={t('progress.stepsDone')}
      quizLabel={t('progress.quiz')}
      quizValue={
        lastExam ? `${lastExam.score ?? 0} / ${lastExam.max_score ?? 0}` : t('progress.noExam')
      }
      quizNote={t('progress.passMarkNote', { mark: `${passMark} / ${MCQ_CONCEPTS.length}` })}
      interviewLabel={t('progress.interview')}
      interviewValue={t(`progress.interviewStatus.${stages.interview.status}`)}
    />
  );

  const record = mine?.dbd_records ?? null;
  const documentUrl = record ? await createMyDocumentSignedUrl(user.id, record.id) : null;
  // The company as the learner is trained on it: the pinned version (D75), or the live row
  // while the record has no version yet. What it does and sells is the manager's answer, not a
  // certificate fact (Level 4).
  const pinned = mine ? await pinnedFactsFor(createSupabaseAdminClient(), mine) : null;
  const structured = record ? readStructuredData(record.structured_data) : null;
  const liveInterview = structured?.interview ?? EMPTY_INTERVIEW_PROFILE;
  const liveBusiness = structured?.business ?? EMPTY_BUSINESS_PROFILE;
  const company = pinned
    ? {
        name_th: pinned.snapshot.facts.company_name_th,
        name_en: pinned.snapshot.facts.company_name_en,
        juristic_id: pinned.snapshot.facts.juristic_id,
        registered_capital: pinned.snapshot.facts.registered_capital,
        registered_on: pinned.snapshot.facts.registered_on,
        head_office_address: pinned.snapshot.extras.head_office_address,
        directors: pinned.snapshot.facts.directors,
        shareholders: pinned.snapshot.facts.shareholders,
        objectives: pinned.snapshot.extras.objectives,
        nature_of_business: pinned.snapshot.facts.nature_of_business,
        products_services: pinned.snapshot.facts.products_services,
        website: record?.website ?? null,
        facebook_page: record?.facebook_page ?? null,
      }
    : record
      ? {
          name_th: record.company_name_th,
          name_en: record.company_name_en,
          juristic_id: record.juristic_id,
          registered_capital: record.registered_capital,
          registered_on: record.registered_on,
          head_office_address: record.head_office_address,
          directors: (record.directors as unknown as Director[] | null) ?? [],
          shareholders: liveBusiness.shareholders,
          objectives: liveBusiness.objectives,
          nature_of_business: liveInterview.nature_of_business,
          products_services: liveInterview.products_services,
          website: record.website,
          facebook_page: record.facebook_page,
        }
      : null;

  const linkLabel = (value: string) =>
    value.replace(/^https?:\/\/(?:www\.)?/i, '').replace(/\/$/, '');
  const companyDetails: CompanyDetail[] = company
    ? [
        {
          label: t('company.registeredDate'),
          value: company.registered_on ? formatDate(company.registered_on, loc) : '—',
          icon: 'date',
          testId: 'company-detail-date',
        },
        {
          label: t('company.address'),
          value: company.head_office_address ?? '—',
          icon: 'address',
          testId: 'company-detail-address',
        },
        {
          label: t('company.directors'),
          value: company.directors.length
            ? company.directors.map((director) => (
                <div key={director.name_th}>{director.name_th}</div>
              ))
            : '—',
          icon: 'directors',
          testId: 'company-detail-directors',
        },
        {
          label: t('company.shareholders'),
          value: company.shareholders.length
            ? company.shareholders.map((shareholder) => (
                <div key={`${shareholder.name}-${shareholder.shares ?? ''}`}>
                  {shareholder.name}
                  {shareholder.percent !== null
                    ? ` — ${shareholder.percent.toLocaleString(NUMBER_LOCALES[loc])}%`
                    : shareholder.shares !== null
                      ? ` — ${shareholder.shares.toLocaleString(NUMBER_LOCALES[loc])} ${t('company.shares')}`
                      : ''}
                </div>
              ))
            : '—',
          icon: 'shareholders',
          testId: 'company-detail-shareholders',
        },
        {
          label: t('company.businessObjectives'),
          value: t('company.itemCount', { count: company.objectives.length }),
          icon: 'objectives',
          testId: 'company-detail-objectives',
        },
        {
          label: t('company.natureOfBusiness'),
          value: company.nature_of_business ?? '—',
          icon: 'nature',
          testId: 'company-nature',
        },
        {
          label: t('company.businessActivities', { count: company.objectives.length }),
          value: company.objectives.length ? (
            <ol className="list-decimal space-y-1 pl-5">
              {company.objectives.map((objective, index) => (
                <li key={`${objective.no ?? index}-${objective.text}`}>{objective.text}</li>
              ))}
            </ol>
          ) : (
            (company.products_services ?? '—')
          ),
          icon: 'activities',
          testId: 'company-products',
        },
      ]
    : [];
  if (company?.website) {
    companyDetails.push({
      label: t('company.website'),
      value: linkLabel(company.website),
      href: company.website,
      icon: 'website',
      testId: 'company-detail-website',
    });
  }
  if (company?.facebook_page) {
    companyDetails.push({
      label: t('company.facebook'),
      value: linkLabel(company.facebook_page),
      href: company.facebook_page,
      icon: 'facebook',
      testId: 'company-detail-facebook',
    });
  }

  return (
    <LearnerShell
      home
      hero={
        <Hero
          kicker={t('hero.kicker')}
          company={company?.name_th ?? null}
          welcome={welcome}
          line={line}
          mobileLine={t('mobileIntro')}
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
          hints={{
            study: t('actionHints.study'),
            nameCard: t('actionHints.nameCard'),
            exam: t('actionHints.exam'),
            interview: t('actionHints.interview'),
          }}
        />
        {company && (
          <CompanyCard
            labels={{
              title: t('company.title'),
              tag: t('company.tag'),
              juristicId: t('company.juristicId'),
              registeredCapital: t('company.registeredCapital'),
              openCertificate: t('company.openCertificate'),
              viewRecord: t('company.viewRecord'),
            }}
            nameTh={company.name_th ?? '—'}
            nameEn={company.name_en}
            juristicId={company.juristic_id ?? '—'}
            registeredCapital={
              company.registered_capital == null
                ? '—'
                : `${Number(company.registered_capital).toLocaleString(NUMBER_LOCALES[loc])} ${t('company.baht')}`
            }
            details={companyDetails}
            documentUrl={documentUrl}
          />
        )}
      </div>
    </LearnerShell>
  );
}
