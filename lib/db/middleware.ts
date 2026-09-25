import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import type { Database } from './database.types';

/**
 * A cheap first gate on the JWT's role, before any page renders. The page guards re-check against
 * the profile row, which is the authoritative copy — this only saves a render. Longest prefix
 * first: the level-1 corners stay admin-only while the rest of /admin opens to staff (spec §11).
 */
const GUARDS = [
  { prefix: '/dashboard', role: 'any' },
  { prefix: '/admin/managers', role: 'admin' },
  { prefix: '/admin/settings', role: 'admin' },
  { prefix: '/admin/audit', role: 'admin' },
  { prefix: '/admin/notifications', role: 'admin' },
  { prefix: '/admin', role: 'staff' },
] as const;

function meetsGuard(guardRole: (typeof GUARDS)[number]['role'], role: unknown): boolean {
  if (guardRole === 'any') return true;
  if (guardRole === 'admin') return role === 'admin';
  return role === 'admin' || role === 'manager';
}

type PendingCookie = { name: string; value: string; options?: Record<string, unknown> };

function splitLocale(pathname: string): { locale: string; path: string } {
  const [, first = '', ...rest] = pathname.split('/');
  if ((routing.locales as readonly string[]).includes(first)) {
    return { locale: first, path: `/${rest.join('/')}` };
  }
  return { locale: routing.defaultLocale, path: pathname };
}

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  return NextResponse.redirect(url);
}

/**
 * Refreshes the Supabase session, applies the route guards, then lets `buildResponse` produce the
 * response from the (possibly cookie-updated) request. Order matters: refreshed auth cookies are
 * written onto `request` first so the app sees them in this same request, and copied onto whatever
 * response goes back to the browser.
 */
export async function handleWithSession(
  request: NextRequest,
  buildResponse: (request: NextRequest) => NextResponse,
): Promise<NextResponse> {
  const pending: PendingCookie[] = [];
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          pending.push(...cookiesToSet);
        },
      },
    },
  );

  // getUser() validates the token with Supabase (never trust getSession() here).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { locale, path } = splitLocale(request.nextUrl.pathname);
  const guard = GUARDS.find((g) => path === g.prefix || path.startsWith(`${g.prefix}/`));

  let response: NextResponse;
  if (guard && !user) {
    response = redirectTo(request, `/${locale}/login`);
  } else if (guard && !meetsGuard(guard.role, user?.app_metadata?.role)) {
    // Send them to their own home rather than always to the learner dashboard: a manager who
    // opens an admin-only URL belongs in the admin area, not in the study screens.
    const role = user?.app_metadata?.role;
    const home = role === 'admin' || role === 'manager' ? 'admin' : 'dashboard';
    response = redirectTo(request, `/${locale}/${home}`);
  } else {
    response = buildResponse(request);
  }

  pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
