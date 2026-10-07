import type { CSSProperties, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

const rise = (delay: string) => ({ '--rise-delay': delay }) as CSSProperties;

type Cta = { href: string; label: string };

/**
 * The dashboard hero on the band (handoff, Dashboard): the company pill, the welcome, the next
 * step in one line and its actions on the left; the progress card on the right.
 */
export function Hero({
  kicker,
  company,
  welcome,
  line,
  mobileLine,
  lineTestId,
  primary,
  secondary,
  children,
}: {
  kicker: string;
  company: string | null;
  welcome: string;
  line: string;
  mobileLine: string;
  lineTestId?: string;
  primary: Cta | null;
  secondary: Cta | null;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-0 pt-4 md:gap-6 md:pt-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end lg:gap-12 lg:pt-13">
      <div>
        {company && (
          <div
            data-testid="hero-kicker"
            className="rise mb-3 hidden items-center gap-2 rounded-full border border-brand-100/20 bg-brand-100/12 px-3.5 py-0.5 text-sm leading-[1.7] font-medium text-brand-100 md:mb-4 md:inline-flex"
            style={rise('0ms')}
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-gold-500" />
            {kicker} · {company}
          </div>
        )}
        <h1
          className="rise font-display text-[25px] leading-[1.45] font-semibold text-brand-900 md:text-[32px] md:leading-[1.35] md:font-medium md:text-white"
          style={rise('80ms')}
        >
          {welcome}
        </h1>
        <p
          data-testid={lineTestId}
          className="rise mt-1 max-w-[560px] text-sm leading-6 text-ink-700 md:mt-2 md:text-base md:leading-[1.75] md:text-brand-100"
          style={rise('160ms')}
        >
          <span className="md:hidden">{mobileLine}</span>
          <span className="hidden md:inline">{line}</span>
        </p>
        {(primary || secondary) && (
          <div
            className="rise mt-5 hidden flex-wrap gap-3 md:mt-6 md:flex"
            style={rise('240ms')}
          >
            {primary && (
              <Link
                href={primary.href}
                className="inline-flex min-h-12 items-center gap-2.5 rounded-control bg-white px-6 text-base font-semibold text-brand-900 shadow-[0_6px_20px_rgb(0_0_0/0.2)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgb(0_0_0/0.28)] focus-visible:outline-gold-100"
              >
                {primary.label}
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            )}
            {secondary && (
              <Link
                href={secondary.href}
                className="inline-flex min-h-12 items-center rounded-control border border-white/35 px-5 text-base font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-gold-100"
              >
                {secondary.label}
              </Link>
            )}
          </div>
        )}
      </div>
      <div className="rise hidden md:block" style={rise('200ms')}>
        {children}
      </div>
    </div>
  );
}
