import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

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

writeFileSync(
  '.env.local',
  [
    `NEXT_PUBLIC_SUPABASE_URL=${vars.API_URL}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
    'APP_INTERNAL_EMAIL_DOMAIN=learner.portal.internal',
    '',
  ].join('\n'),
);
console.log('.env.local written from the local Supabase stack');
