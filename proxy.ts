import createIntlMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { handleWithSession } from './lib/db/middleware';

// Next.js 16: the request-boundary file is `proxy.ts` (formerly middleware.ts).
const handleI18n = createIntlMiddleware(routing);

export default async function proxy(request: NextRequest) {
  return handleWithSession(request, handleI18n);
}

export const config = {
  // Skip API routes, Next internals, Vercel internals and static files (paths containing a dot).
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
