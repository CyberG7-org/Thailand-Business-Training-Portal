'use client';

import { BackPill } from '@/components/shell/back-pill';
import { Link, usePathname } from '@/i18n/navigation';

const PILL =
  'inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/15 focus-visible:outline-gold-100';

/** Back and Home on the band of every staff page below the home; nothing on the home itself. */
export function StaffPills({
  home,
  backLabel,
  homeLabel,
}: {
  home: string;
  backLabel: string;
  homeLabel: string;
}) {
  const pathname = usePathname();
  if (pathname === home) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <BackPill home={home} label={backLabel} />
      <Link href={home} data-testid="nav-home" className={PILL}>
        {homeLabel}
      </Link>
    </div>
  );
}
