import { NextResponse, type NextRequest } from 'next/server';
import { processDueNotifications } from '@/lib/db/notifications';
import { getNotifier } from '@/lib/integrations/notify';

/**
 * Drains the notification queue. Vercel Cron calls this every minute with
 * `Authorization: Bearer $CRON_SECRET`; anything else is rejected.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const summary = await processDueNotifications((channel) => getNotifier(channel));
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
