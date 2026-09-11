import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Next.js 16: the request-boundary file is `proxy.ts` (formerly middleware.ts).
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals, Vercel internals and static files (paths containing a dot).
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
