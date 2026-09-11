import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/db/admin';
import { resolveExtractionProvider } from '@/lib/integrations/extraction';
import { resolveNotifyProvider } from '@/lib/integrations/notify';
import { resolveTtsProvider } from '@/lib/integrations/tts';
import { resolveVapiProvider } from '@/lib/integrations/vapi';

export const dynamic = 'force-dynamic';

/**
 * Uptime probe for the pilot (P10): database reachability plus which provider each adapter
 * resolved to. Never echoes configuration values — only the provider names.
 */
export async function GET() {
  const startedAt = Date.now();
  let db: 'ok' | 'error' = 'ok';
  try {
    const { error } = await createSupabaseAdminClient()
      .from('policy_config')
      .select('key', { head: true, count: 'exact' })
      .limit(1);
    if (error) db = 'error';
  } catch {
    db = 'error';
  }
  const body = {
    ok: db === 'ok',
    db,
    latencyMs: Date.now() - startedAt,
    providers: {
      extraction: resolveExtractionProvider(),
      tts: resolveTtsProvider(),
      notify: resolveNotifyProvider(),
      vapi: resolveVapiProvider(),
    },
    cronConfigured: Boolean(process.env.CRON_SECRET),
    webhookConfigured: Boolean(process.env.VAPI_WEBHOOK_SECRET),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
  };
  return NextResponse.json(body, {
    status: body.ok ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
