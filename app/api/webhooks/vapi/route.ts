import { NextResponse, type NextRequest } from 'next/server';
import { ingestVapiMessage } from '@/lib/db/calls';
import { parseVapiMessage } from '@/lib/integrations/vapi/webhook';

/**
 * Vapi server URL. Authenticated by the `x-vapi-secret` header we configure on the assistant
 * (decision D28); every delivery is ledgered, so retries and duplicates are harmless.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret || request.headers.get('x-vapi-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = parseVapiMessage(body);
  if (!parsed) return NextResponse.json({ error: 'unrecognized' }, { status: 400 });
  try {
    const outcome = await ingestVapiMessage(parsed, body);
    return NextResponse.json({ ok: true, outcome });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
