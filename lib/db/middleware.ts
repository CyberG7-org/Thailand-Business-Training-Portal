import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import type { Database } from './database.types';

const GUARDS = [
  { prefix: '/dashboard', role: 'any' },
  { prefix: '/admin', role: 'admin' },
] as const;

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
  } else if (guard?.role === 'admin' && user?.app_metadata?.role !== 'admin') {
    response = redirectTo(request, `/${locale}/dashboard`);
  } else {
    response = buildResponse(request);
  }

  pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
