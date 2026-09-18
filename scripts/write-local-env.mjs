import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// `supabase status -o env` prints KEY="value" lines for the running local stack.
const out = execSync('pnpm exec supabase status -o env', { encoding: 'utf8' });
const vars = Object.fromEntries(
  out
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [
        line.slice(0, i).trim(),
        line
          .slice(i + 1)
          .trim()
          .replace(/^"|"$/g, ''),
      ];
    }),
);

const anonKey = vars.ANON_KEY ?? vars.PUBLISHABLE_KEY;
const serviceKey = vars.SERVICE_ROLE_KEY ?? vars.SECRET_KEY;
if (!vars.API_URL || !anonKey || !serviceKey) {
  console.error(
    'Could not read API_URL / ANON_KEY / SERVICE_ROLE_KEY. Is `pnpm db:start` running?',
  );
  process.exit(1);
}

// Lines this script owns. Anything else already in .env.local (e.g. your own provider keys)
// is preserved below the managed block.
const managed = {
  NEXT_PUBLIC_SUPABASE_URL: vars.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  APP_INTERNAL_EMAIL_DOMAIN: 'learner.portal.internal',
  // Dev-only secrets so the cron and webhook routes are exercisable locally and in CI.
  CRON_SECRET: 'local-cron-secret-for-dev',
  VAPI_WEBHOOK_SECRET: 'local-vapi-webhook-secret',
};

const kept = existsSync('.env.local')
  ? readFileSync('.env.local', 'utf8')
      .split('\n')
      .filter((line) => {
        const key = line.split('=')[0]?.trim();
        return line.trim() !== '' && !line.startsWith('#') && key && !(key in managed);
      })
  : [];

const lines = Object.entries(managed).map(([k, v]) => `${k}=${v}`);
if (kept.length > 0) lines.push('', '# Your own additions (kept by scripts/write-local-env.mjs)', ...kept);
writeFileSync('.env.local', lines.join('\n') + '\n');
console.log(
  `.env.local written from the local Supabase stack${kept.length ? ` (${kept.length} extra line(s) kept)` : ''}`,
);
