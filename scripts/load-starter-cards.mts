// Loads the five bank-interview starter study cards (D39) into the database named by
// NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local, or the environment).
// Staff no longer edit study cards (D81), so this is how a fresh environment gets them.
// Safe to run again: a card whose key already exists is left untouched.
//
// Usage: pnpm content:starter
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { BANK_INTERVIEW_CARDS } from '../lib/content/bank-interview-cards.ts';
import { loadStarterCards } from '../lib/db/study.ts';

config({ path: '.env.local', quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// The cards are recorded as created by the owner, the admin account that loaded them in the UI.
const { data: owner, error } = await db
  .from('profiles')
  .select('id, login_id')
  .eq('role', 'admin')
  .order('created_at')
  .limit(1)
  .maybeSingle();
if (error) throw error;
if (!owner) {
  console.error('No admin account yet: create the owner first (production-setup §1).');
  process.exit(1);
}

const { created, skipped } = await loadStarterCards(db as never, BANK_INTERVIEW_CARDS, owner.id);
console.log(`Starter cards: ${created.length} created, ${skipped.length} already there.`);
for (const key of created) console.log(`  + ${key}`);
