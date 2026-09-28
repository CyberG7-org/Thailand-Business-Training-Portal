'use client';

import { Link, usePathname, useRouter } from '@/i18n/navigation';

const PILL =
  'inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/15 focus-visible:outline-gold-100';

/**
 * The back pill on the band. With a fixed destination it is a plain link; otherwise it steps
 * through the browser history when there is somewhere to go and falls back to the home page (a
 * page opened from a link or a bookmark). Hidden on the home page itself.
 */
export function BackPill({ home, label, href }: { home: string; label: string; href?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  if (pathname === home) return null;
  if (href) {
    return (
      <Link href={href} data-testid="nav-back" className={PILL}>
        <span aria-hidden="true">←</span>
        {label}
      </Link>
    );
  }
  const back = () => {
    if (window.history.length > 1) router.back();
    else router.push(home);
  };
  return (
    <button type="button" onClick={back} data-testid="nav-back" className={PILL}>
      <span aria-hidden="true">←</span>
      {label}
    </button>
  );
}
