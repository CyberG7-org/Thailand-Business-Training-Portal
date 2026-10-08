import type { CSSProperties, ReactNode } from 'react';

const rise = (delay: string) => ({ '--rise-delay': delay }) as CSSProperties;

/**
 * The dashboard hero on the band: the company pill, welcome and next-step guidance on the left,
 * with the progress summary on the right. Stage navigation lives in the list below the band.
 */
export function Hero({
  kicker,
  company,
  welcome,
  line,
  mobileLine,
  lineTestId,
  children,
}: {
  kicker: string;
  company: string | null;
  welcome: string;
  line: string;
  mobileLine: string;
  lineTestId?: string;
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
      </div>
      <div className="rise hidden md:block" style={rise('200ms')}>
        {children}
      </div>
    </div>
  );
}
