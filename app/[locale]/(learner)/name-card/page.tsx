import type { CSSProperties } from 'react';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { LearnerShell } from '@/components/shell/learner-shell';
import { requireUser } from '@/lib/auth/session';
import {
  createMyNameCardUrl,
  downloadNameCardPdf,
  ensureNameCard,
  type EnsuredNameCard,
} from '@/lib/db/name-cards';
import { formatThaiMobile } from '@/lib/domain/phone';
import { ReactPdfRenderer } from '@/lib/integrations/pdf/name-card';
import { renderPages } from '@/lib/pdf/render-pages';

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

/** The reasons a card cannot be made that the learner is told; anything else reads as no company. */
const SHOWN_REASONS = [
  'no_assignment',
  'exam_required',
  'missing_fields',
  'no_phone',
  'no_name',
] as const;
type ShownReason = (typeof SHOWN_REASONS)[number];
const reasonOf = (blocked: NonNullable<EnsuredNameCard['blocked']>): ShownReason =>
  SHOWN_REASONS.find((r) => r === blocked.code) ?? 'no_assignment';

/** Crisp, viewer-independent pictures for the two-page card; the PDF remains the download. */
async function previewPictures(pdfPath: string): Promise<[string, string] | null> {
  try {
    const pages = await renderPages(await downloadNameCardPdf(pdfPath), [1, 2]);
    if (pages.length !== 2) return null;
    return pages.map((page) => `data:image/png;base64,${Buffer.from(page).toString('base64')}`) as [
      string,
      string,
    ];
  } catch (error) {
    console.error('name card: could not render preview pictures', error);
    return null;
  }
}

/**
 * The name card (handoff, 06; D96): made for the learner from what staff entered, so the page
 * only shows it — crisp pictures of the real PDF on its stage and the download in its footer.
 * The learner types nothing; a card that cannot be made yet says why, for the manager to fix.
 */
export default async function NameCardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const [{ card, blocked }, t] = await Promise.all([
    ensureNameCard(user.id, new ReactPdfRenderer()),
    getTranslations('nameCard'),
  ]);
  const [pdfUrl, pictures] = card
    ? await Promise.all([
        createMyNameCardUrl(user.id, card.id),
        previewPictures(card.pdf_path),
      ])
    : [null, null];
  const previewUrl = (page: 1 | 2) =>
    `${pdfUrl}#page=${page}&zoom=page-width&view=FitH&toolbar=0&navpanes=0&scrollbar=0`;

  return (
    <LearnerShell title={t('title')} intro={t('intro')} step="nameCard">
      <div className="mx-auto grid max-w-[1240px] gap-6">
        {blocked && (
          <Blocked>
            {t(`errors.${reasonOf(blocked)}`, { fields: blocked.fields.join(', ') })}
          </Blocked>
        )}

        {card && pdfUrl && (
          <section
            data-testid="card-preview"
            className="rise overflow-hidden rounded-card bg-white shadow-raised"
            style={rise('80ms')}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 bg-brand-50 px-5 py-4 md:px-6">
              <div>
                <h2 className="font-display text-[22px] leading-[1.45] font-semibold text-brand-900">
                  {t('preview')}
                </h2>
                <p className="mt-1 text-sm leading-6 text-ink-700">{t('previewHint')}</p>
              </div>
              <span data-testid="card-meta" className="text-sm text-ink-700 tabular-nums">
                {t('meta', { phone: formatThaiMobile(card.phone_number) })}
              </span>
            </div>
            <div
              data-testid="card-stage"
              className="grid gap-5 border-b border-ink-100 bg-[linear-gradient(135deg,var(--color-ink-50),var(--color-brand-50))] p-4 md:p-6 lg:grid-cols-2 lg:p-8"
            >
              {([1, 2] as const).map((page) => (
                <figure
                  key={page}
                  data-testid={page === 1 ? 'card-front' : 'card-back'}
                  className="min-w-0"
                >
                  <figcaption className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-brand-900">
                    <span
                      aria-hidden="true"
                      className="grid size-6 place-items-center rounded-full bg-brand-900 text-xs text-white tabular-nums"
                    >
                      {page}
                    </span>
                    {t(page === 1 ? 'front' : 'back')}
                  </figcaption>
                  <div className="overflow-hidden rounded-[10px] bg-white shadow-[0_1px_2px_rgb(12_26_58/0.1),0_18px_44px_rgb(12_26_58/0.16)] ring-1 ring-brand-900/10">
                    {pictures ? (
                      <a
                        href={previewUrl(page)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${t('openSide')} ${t(page === 1 ? 'front' : 'back')}`}
                        className="group block focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand-600"
                      >
                        <Image
                          src={pictures[page - 1]}
                          alt={`${t('title')} — ${t(page === 1 ? 'front' : 'back')}`}
                          width={765}
                          height={459}
                          unoptimized
                          className="pop aspect-[5/3] w-full object-contain transition-transform duration-200 group-hover:scale-[1.015]"
                        />
                      </a>
                    ) : (
                      <iframe
                        src={previewUrl(page)}
                        title={`${t('title')} — ${t(page === 1 ? 'front' : 'back')}`}
                        className="pop aspect-[5/3] w-full bg-white"
                      />
                    )}
                  </div>
                </figure>
              ))}
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
            </div>
          </section>
        )}
      </div>
    </LearnerShell>
  );
}
