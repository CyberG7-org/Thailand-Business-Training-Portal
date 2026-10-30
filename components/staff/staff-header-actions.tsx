'use client';

import { useState } from 'react';
import { LanguageToggle } from '@/components/language-toggle';
import { ProfileDropdown } from './profile-dropdown';

type OpenMenu = 'language' | 'profile' | null;

export function StaffHeaderActions({
  languageLabel,
  profile,
}: {
  languageLabel: string;
  profile: {
    name: string;
    loginId: string;
    initials: string;
    locale: string;
    labels: { profile: string; profileSettings: string; signOut: string };
  };
}) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);

  return (
    <div className="contents md:flex md:shrink-0 md:items-center md:gap-3">
      <LanguageToggle
        label={languageLabel}
        tone="staff"
        className="col-start-2 row-start-1"
        open={openMenu === 'language'}
        onOpenChange={(open) => setOpenMenu(open ? 'language' : null)}
      />
      <ProfileDropdown
        {...profile}
        className="col-start-2 row-start-2"
        open={openMenu === 'profile'}
        onOpenChange={(open) => setOpenMenu(open ? 'profile' : null)}
      />
    </div>
  );
}
