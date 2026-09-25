import { LearnerShell } from '@/components/shell/learner-shell';
import { getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/auth/session';
import { createMyNameCardUrl, getMyLatestNameCard, nameCardReadiness } from '@/lib/db/name-cards';
import { createSupabaseServerClient } from '@/lib/db/server';
import { formatThaiMobile } from '@/lib/domain/phone';
import { GenerateForm, SendForm } from './name-card-forms';

export default async function NameCardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const [readiness, card] = await Promise.all([
    nameCardReadiness(user.id),
    getMyLatestNameCard(await createSupabaseServerClient(), user.id),
  ]);
  const pdfUrl = card ? await createMyNameCardUrl(user.id, card.id) : null;
  const t = await getTranslations('nameCard');
  const blocked =
    (readiness.examRequired && !readiness.examPassed) || readiness.missingFields.length > 0;

  return (
    <LearnerShell title={t('title')} step="nameCard">
      <section className="grid gap-6">
        <p className="max-w-2xl text-sm text-gray-700">{t('intro')}</p>

        {readiness.examRequired && !readiness.examPassed && (
          <p
            data-testid="card-blocked"
            className="max-w-md rounded border border-amber-300 bg-amber-50 p-3 text-sm"
          >
            {t('errors.exam_required')}
          </p>
        )}
        {readiness.missingFields.length > 0 && (
          <p
            data-testid="card-blocked"
            className="max-w-md rounded border border-amber-300 bg-amber-50 p-3 text-sm"
          >
            {t('errors.missing_fields', { fields: readiness.missingFields.join(', ') })}
          </p>
        )}

        {!blocked && (
          <GenerateForm
            hasCard={card !== null}
            defaultPhone={card ? formatThaiMobile(card.phone_number) : ''}
          />
        )}

        {card && pdfUrl && (
          <div className="grid max-w-2xl gap-3" data-testid="card-preview">
            <h2 className="font-semibold">{t('preview')}</h2>
            <iframe src={pdfUrl} title={t('title')} className="h-[24rem] w-full rounded border" />
            <div className="flex flex-wrap items-center gap-4">
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="download-card"
                className="text-sm underline"
              >
                {t('download')}
              </a>
              <SendForm cardId={card.id} sentAt={card.telegram_sent_at} />
            </div>
            <p className="text-xs text-gray-500">
              {t('meta', {
                version: card.template_version,
                phone: formatThaiMobile(card.phone_number),
              })}
            </p>
          </div>
        )}
      </section>
    </LearnerShell>
  );
}
