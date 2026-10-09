import {
  ArrowSquareOutIcon,
  BuildingsIcon,
  CalendarDotsIcon,
  CoinsIcon,
  FacebookLogoIcon,
  GlobeIcon,
  IdentificationCardIcon,
  MapPinIcon,
  TargetIcon,
  UserIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react/dist/ssr';
import type { ReactNode } from 'react';

type DetailIcon =
  | 'address'
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
  if (icon === 'website') return <GlobeIcon {...props} />;
  return <FacebookLogoIcon {...props} />;
}

/** Complete company record: the same readable detail-card language at every breakpoint. */
export function CompanyCard({
  labels,
  nameTh,
  nameEn,
  juristicId,
  registeredCapital,
  details,
}: {
  labels: Labels;
  nameTh: string;
  nameEn: string | null;
  juristicId: string;
  registeredCapital: string;
  details: CompanyDetail[];
}) {
  return (
    <section
      data-testid="company-card"
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

      <div className="flex flex-col gap-2.5 pt-2.5 md:gap-4 md:px-6 md:pt-6 md:pb-6">
        <div className="grid gap-2.5 md:grid-cols-2">
          <div className="flex items-center gap-3 rounded-card bg-white px-4 py-3 shadow-glass md:min-h-20 md:border md:border-brand-100 md:bg-brand-50/70 md:px-5 md:py-4 md:shadow-none">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600">
              <IdentificationCardIcon className="size-5" weight="duotone" />
            </span>
            <div className="min-w-0">
              <div className="text-sm leading-[1.4] text-ink-500 md:text-ink-700">
                {labels.juristicId}
              </div>
              <div className="font-semibold text-brand-900 tabular-nums">{juristicId}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-card bg-white px-4 py-3 shadow-glass md:min-h-20 md:border md:border-brand-100 md:bg-brand-50/70 md:px-5 md:py-4 md:shadow-none">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600">
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

        <dl className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:gap-3 xl:grid-cols-3">
          {details.map((detail) => {
            const span =
              detail.icon === 'address' || detail.icon === 'nature' ? 'md:col-span-2' : '';
            return (
              <div
                key={detail.label}
                data-testid={detail.testId}
                className={`flex gap-3 rounded-card bg-white px-4 py-3 shadow-glass md:min-h-20 md:border md:border-brand-100 md:bg-brand-50/45 md:px-5 md:py-4 md:shadow-none ${span}`}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600">
                  <DetailMark icon={detail.icon} />
                </span>
                <div className="min-w-0">
                  <dt className="text-sm leading-[1.4] text-ink-500">{detail.label}</dt>
                  <dd className="mt-0.5 leading-[1.55] font-medium break-words text-ink-900 tabular-nums">
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
            );
          })}
        </dl>
      </div>
    </section>
  );
}
