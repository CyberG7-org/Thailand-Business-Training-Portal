'use client';

import { Link, usePathname, useRouter } from '@/i18n/navigation';

/**
 * "Back" and "Home" on every page below the header. Back steps through the browser history
 * when there is somewhere to go and falls back to the home page (for a page opened from a link
 * or a bookmark); both hide on the home page itself.
 */
export function PageNav({
  home,
  labels,
}: {
  home: string;
  labels: { back: string; home: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  if (pathname === home) return null;
  const back = () => {
    if (window.history.length > 1) router.back();
    else router.push(home);
  };
  return (
    <nav aria-label={labels.back} className="flex items-center gap-4 border-b px-6 py-2 text-sm">
      <button type="button" onClick={back} data-testid="nav-back" className="underline">
        ← {labels.back}
      </button>
      <Link href={home} data-testid="nav-home" className="underline">
        {labels.home}
      </Link>
    </nav>
  );
}
