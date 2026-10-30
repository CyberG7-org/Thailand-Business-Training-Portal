import type { ReactNode } from 'react';
import { getLocale } from 'next-intl/server';
import type { CurrentUser } from '@/lib/auth/session';
import { initialsOf } from '@/lib/domain/initials';
import { displayLoginId } from '@/lib/domain/login-id';
import { StaffShellClient } from './staff-shell-client';

/** Server boundary for the interactive staff layout. */
export async function StaffShell({
  user,
  side,
  children,
}: {
  user: CurrentUser;
  side?: ReactNode;
  children: ReactNode;
}) {
  const locale = await getLocale();
  const role =
    user.role === 'admin' ? 'admin' : user.role === 'submanager' ? 'submanager' : 'manager';

  return (
    <StaffShellClient
      role={role}
      side={side}
      profile={{
        name: user.displayName ?? displayLoginId(user.loginId),
        loginId: displayLoginId(user.loginId),
        initials: initialsOf(user.displayName, user.loginId),
        locale,
      }}
    >
      {children}
    </StaffShellClient>
  );
}
