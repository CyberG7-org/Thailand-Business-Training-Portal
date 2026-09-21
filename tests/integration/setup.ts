import { config } from 'dotenv';

config({ path: '.env.local' });

for (const name of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]) {
  if (!process.env[name]) {
    throw new Error(`${name} is missing. Run: pnpm db:start && pnpm db:env`);
  }
}

// Real provider keys in .env.local must never be used by the suite (cost, and the fixtures are
// fictional): every adapter that a test does not inject explicitly resolves to its fake, as the
// Playwright config does for the e2e suite.
for (const name of [
  'EXTRACTION_PROVIDER',
  'TTS_PROVIDER',
  'NOTIFY_PROVIDER',
  'VAPI_PROVIDER',
  'QUESTION_GEN_PROVIDER',
  'VECTOR_PROVIDER',
]) {
  process.env[name] = 'fake';
}
