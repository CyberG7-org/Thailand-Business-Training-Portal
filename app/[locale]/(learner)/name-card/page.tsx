import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import { LearnerShell } from '@/components/shell/learner-shell';
import { requireUser } from '@/lib/auth/session';
import { createMyNameCardUrl, getMyLatestNameCard, nameCardReadiness } from '@/lib/db/name-cards';
import { createSupabaseServerClient } from '@/lib/db/server';
import { formatThaiMobile } from '@/lib/domain/phone';
import { GenerateForm, SendForm } from './name-card-forms';

const rise = (delay: string) => ({ '--rise-delay': delay }) as CSSProperties;

/** A reason the card cannot be made yet, in place of the form (handoff, 06). */
function Blocked({ children }: { children: string }) {
  return (
    <p
      data-testid="card-blocked"
      data-tone="warn"
      role="status"
      className="rounded-control bg-warn-50 px-4 py-3 text-sm leading-[1.7] font-medium text-warn-700"
    >
      {children}
    </p>
  );
}

/**
 * The name card (handoff, 06): the form card on the left, the preview card with the real PDF on
 * its stage and the actions in its footer on the right. A learner who cannot make a card yet
 * sees why instead of the form.
 */
export default async function NameCardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const [readiness, card] = await Promise.all([
    nameCardReadiness(user.id),
    getMyLatestNameCard(await createSupabaseServerClient(), user.id),
  ]);
  const pdfUrl = card ? await createMyNameCardUrl(user.id, card.id) : null;
  const t = await getTranslations('nameCard');
  const examBlocked = readiness.examRequired && !readiness.examPassed;
  const blocked = examBlocked || readiness.missingFields.length > 0;

  return (
    <LearnerShell title={t('title')} intro={t('intro')} step="nameCard">
      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
        {blocked ? (
          <div className="rise grid gap-3">
            {examBlocked && <Blocked>{t('errors.exam_required')}</Blocked>}
            {readiness.missingFields.length > 0 && (
              <Blocked>
                {t('errors.missing_fields', { fields: readiness.missingFields.join(', ') })}
              </Blocked>
            )}
          </div>
        ) : (
          <GenerateForm
            hasCard={card !== null}
            defaultPhone={card ? formatThaiMobile(card.phone_number) : ''}
          />
        )}

        {card && pdfUrl && (
          <section
            data-testid="card-preview"
            className="rise overflow-hidden rounded-card bg-white shadow-raised"
            style={rise('80ms')}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 bg-brand-50 px-5 py-4 md:px-6">
              <h2 className="font-display text-[22px] leading-[1.45] font-semibold text-brand-900">
                {t('preview')}
              </h2>
              <span data-testid="card-meta" className="text-sm text-ink-700 tabular-nums">
                {t('meta', {
                  version: card.template_version,
                  phone: formatThaiMobile(card.phone_number),
                })}
              </span>
            </div>
            <div
              data-testid="card-stage"
              className="grid place-items-center border-b border-ink-100 bg-ink-50 p-4 md:p-10"
            >
              <iframe
                src={pdfUrl}
                title={t('title')}
                className="pop h-[22rem] w-full max-w-[560px] rounded-[6px] bg-white shadow-[0_1px_2px_rgb(12_26_58/0.1),0_16px_40px_rgb(12_26_58/0.14)] md:aspect-[90/54] md:h-auto"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 px-5 py-4 md:px-6">
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="download-card"
                className="inline-flex min-h-12 items-center gap-2 rounded-control bg-brand-600 px-5 text-base font-semibold text-white transition-colors hover:bg-brand-700"
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
                </svg>
                {t('download')}
              </a>
              <SendForm cardId={card.id} sentAt={card.telegram_sent_at} />
            </div>
          </section>
        )}
      </div>
    </LearnerShell>
  );
}
