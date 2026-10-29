'use client';

import { ArrowUpIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const REVEAL_AFTER_PX = 400;

/** A mobile shortcut for long pages, shared by every localized route. */
export function BackToTopButton() {
  const t = useTranslations('app');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > REVEAL_AFTER_PX);
    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateVisibility);
  }, []);

  if (!visible) return null;

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label={t('backToTop')}
      title={t('backToTop')}
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 grid size-12 place-items-center rounded-full border border-white/20 bg-brand-700 text-white shadow-raised transition-[transform,background-color] hover:bg-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 active:translate-y-0.5 motion-reduce:transition-none md:hidden"
    >
      <ArrowUpIcon aria-hidden="true" size={22} weight="bold" />
    </button>
  );
}
