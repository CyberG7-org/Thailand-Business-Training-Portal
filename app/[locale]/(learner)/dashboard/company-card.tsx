import {
  ArrowSquareOutIcon,
  BuildingsIcon,
  CalendarDotsIcon,
  CoinsIcon,
  FacebookLogoIcon,
  FileTextIcon,
  GlobeIcon,
  IdentificationCardIcon,
  ListChecksIcon,
  MapPinIcon,
  TargetIcon,
  UserIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react/dist/ssr';
import type { ReactNode } from 'react';

type DetailIcon =
  | 'address'
  | 'activities'
  | 'date'
  | 'directors'
  | 'facebook'
  | 'nature'
  | 'objectives'
  | 'shareholders'
  | 'website';

type Labels = {
  title: string;
  tag: string;
  juristicId: string;
  registeredCapital: string;
  openCertificate: string;
  viewRecord: string;
};

export type CompanyDetail = {
  label: string;
  value: ReactNode;
  icon: DetailIcon;
  href?: string;
  testId?: string;
};

function DetailMark({ icon }: { icon: DetailIcon }) {
  const className = 'size-5';
  const props = { className, weight: 'duotone' as const };
  if (icon === 'address') return <MapPinIcon {...props} />;
  if (icon === 'date') return <CalendarDotsIcon {...props} />;
  if (icon === 'directors') return <UserIcon {...props} />;
  if (icon === 'shareholders') return <UsersThreeIcon {...props} />;
  if (icon === 'objectives') return <TargetIcon {...props} />;
  if (icon === 'nature') return <BuildingsIcon {...props} />;
  if (icon === 'activities') return <ListChecksIcon {...props} />;
  if (icon === 'website') return <GlobeIcon {...props} />;
  return <FacebookLogoIcon {...props} />;
}

/** Complete company record: comfortable scrollable cards on phones, compact details on desktop. */
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
  details: CompanyDetail[];
  documentUrl: string | null;
}) {
  return (
    <section
      className="rise md:overflow-hidden md:rounded-card md:bg-white md:shadow-raised"
      style={{ '--rise-delay': '100ms' } as React.CSSProperties}
    >
      <div className="card-hero rounded-card px-5 py-5 text-white md:rounded-none md:px-6">
        <div className="flex items-center gap-4">
          <BuildingsIcon className="size-12 shrink-0 text-white" weight="duotone" />
          <div className="min-w-0">
            <div className="text-xs font-medium tracking-[0.08em] text-brand-100 uppercase">
              {labels.title}
            </div>
            <div
              className="mt-0.5 font-display text-[20px] leading-[1.35] font-semibold md:text-[22px]"
              data-testid="company-name"
            >
              {nameEn || nameTh}
            </div>
            {nameEn && <div className="mt-1 text-sm leading-[1.5] text-brand-100">{nameTh}</div>}
            <span className="mt-2 inline-flex rounded-full bg-white/16 px-2.5 py-0.5 text-xs font-medium">
              {labels.tag}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 pt-2.5 md:gap-4 md:px-6 md:pt-5 md:pb-6">
        <div className="grid gap-2.5 md:grid-cols-2">
          <div className="flex items-center gap-3 rounded-card bg-white px-4 py-3 shadow-glass md:rounded-control md:bg-brand-50 md:shadow-none">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600 md:hidden">
              <IdentificationCardIcon className="size-5" weight="duotone" />
            </span>
            <div className="min-w-0">
              <div className="text-sm leading-[1.4] text-ink-500 md:text-ink-700">
                {labels.juristicId}
              </div>
              <div className="font-semibold text-brand-900 tabular-nums">{juristicId}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-card bg-white px-4 py-3 shadow-glass md:rounded-control md:bg-brand-50 md:shadow-none">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600 md:hidden">
              <CoinsIcon className="size-5" weight="duotone" />
            </span>
            <div className="min-w-0">
              <div className="text-sm leading-[1.4] text-ink-500 md:text-ink-700">
                {labels.registeredCapital}
              </div>
              <div className="font-semibold text-brand-900 tabular-nums">{registeredCapital}</div>
            </div>
          </div>
        </div>

        <dl className="flex flex-col gap-2.5 md:grid md:grid-cols-[minmax(110px,max-content)_minmax(0,1fr)] md:gap-x-3 md:gap-y-2.5 md:text-sm md:leading-[1.7]">
          {details.map((detail) => (
            <div
              key={detail.label}
              data-testid={detail.testId}
              className="flex gap-3 rounded-card bg-white px-4 py-3 shadow-glass md:contents md:rounded-none md:bg-transparent md:p-0 md:shadow-none"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600 md:hidden">
                <DetailMark icon={detail.icon} />
              </span>
              <div className="min-w-0 md:contents">
                <dt className="text-sm leading-[1.4] text-ink-500">{detail.label}</dt>
                <dd className="mt-0.5 leading-[1.55] font-medium break-words text-ink-900 tabular-nums md:mt-0 md:font-normal">
                  {detail.href ? (
                    <a
                      href={detail.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-brand-600 underline-offset-2 hover:underline"
                    >
                      {detail.value}
                      <ArrowSquareOutIcon className="size-4 shrink-0" aria-hidden="true" />
                    </a>
                  ) : (
                    detail.value
                  )}
                </dd>
              </div>
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
            <FileTextIcon className="size-5" weight="duotone" />
            <span className="md:hidden">{labels.viewRecord}</span>
            <span className="hidden md:inline">{labels.openCertificate}</span>
          </a>
        )}
      </div>
    </section>
  );
}
