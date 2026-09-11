import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { E2E_ADMIN, E2E_LEARNER, E2E_PASSWORD } from './fixtures';

config({ path: '.env.local' });

export default async function globalSetup() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const domain = process.env.APP_INTERNAL_EMAIL_DOMAIN ?? 'learner.portal.internal';
  for (const { loginId, role } of [E2E_ADMIN, E2E_LEARNER]) {
    const { error } = await admin.auth.admin.createUser({
      email: `${loginId}@${domain}`,
      password: E2E_PASSWORD,
      email_confirm: true,
      user_metadata: { login_id: loginId, display_name: loginId, preferred_language: 'th' },
      app_metadata: { role },
    });
    if (error && !/already|exists|registered/i.test(error.message)) throw error;
  }
}
