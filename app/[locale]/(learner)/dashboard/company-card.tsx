import type { ReactNode } from 'react';

type Labels = {
  title: string;
  tag: string;
  juristicId: string;
  registeredCapital: string;
  address: string;
  directors: string;
  issuedOn: string;
  natureOfBusiness: string;
  productsServices: string;
  openCertificate: string;
};

/**
 * The company card (handoff, Dashboard): a brand gradient header with the company's names, two
 * stat tiles, the details as a definition list and the certificate as the primary action. The
 * values are shown as the record holds them (D47: dates as printed).
 */
export function CompanyCard({
  labels,
  nameTh,
  nameEn,
  juristicId,
  registeredCapital,
  details,
  documentUrl,
}: {
  labels: Labels;
  nameTh: string;
  nameEn: string | null;
  juristicId: string;
  registeredCapital: string;
  details: { label: string; value: ReactNode; testId?: string }[];
  documentUrl: string | null;
}) {
  return (
    <section
      className="rise overflow-hidden rounded-card bg-white shadow-raised"
      style={{ '--rise-delay': '100ms' } as React.CSSProperties}
    >
      <div className="card-hero px-4 py-4 text-white md:px-6 md:py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm leading-[1.7] font-medium text-brand-100">{labels.title}</div>
          <span className="rounded-full bg-white/16 px-2.5 py-px text-sm font-medium whitespace-nowrap">
            {labels.tag}
          </span>
        </div>
        <div
          className="font-display text-[20px] leading-[1.7] font-semibold md:text-[22px]"
          data-testid="company-name"
        >
          {nameTh}
        </div>
        {nameEn && <div className="text-sm leading-[1.7] text-brand-100">{nameEn}</div>}
      </div>
      <div className="flex flex-col gap-4 px-4 pt-4 pb-5 md:px-6 md:pt-5 md:pb-6">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-control bg-brand-50 px-3.5 py-2.5">
            <div className="text-sm leading-[1.7] text-ink-700">{labels.juristicId}</div>
            <div className="text-base font-semibold text-brand-900 tabular-nums">{juristicId}</div>
          </div>
          <div className="rounded-control bg-brand-50 px-3.5 py-2.5">
            <div className="text-sm leading-[1.7] text-ink-700">{labels.registeredCapital}</div>
            <div className="text-base font-semibold text-brand-900 tabular-nums">
              {registeredCapital}
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-[minmax(110px,max-content)_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm leading-[1.7]">
          {details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-ink-500">{d.label}</dt>
              <dd data-testid={d.testId} className="tabular-nums">
                {d.value}
              </dd>
            </div>
          ))}
        </dl>
        {documentUrl && (
          <a
            href={documentUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center justify-center gap-2 rounded-control bg-brand-600 text-base font-medium text-white transition-colors hover:bg-brand-700"
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
              <path d="M14 3H6v18h12V7z" />
              <path d="M14 3v4h4" />
            </svg>
            {labels.openCertificate}
          </a>
        )}
      </div>
    </section>
  );
}
