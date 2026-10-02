import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// Baseline hardening headers (P9). The microphone stays available on our own origin for the
// in-browser bank call; everything else that the app never uses is switched off.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
];

const nextConfig: NextConfig = {
  // pdf.js and its canvas draw document pages for the reader (D98); the canvas is a native
  // module and neither is to be bundled.
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist'],
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
