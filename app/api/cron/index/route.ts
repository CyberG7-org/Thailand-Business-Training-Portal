import { NextResponse, type NextRequest } from 'next/server';
import { processIndexJobs } from '@/lib/db/dbd-index';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import { getVectorStore } from '@/lib/integrations/vector';

// Transcribing 5-page slices takes ~1 minute each; leave headroom below the 300 s ceiling.
export const maxDuration = 300;
const WORK_BUDGET_MS = 240_000;

/**
 * Drains index jobs (P14). Vercel Cron calls this every minute with
 * `Authorization: Bearer $CRON_SECRET`; anything else is rejected.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const summary = await processIndexJobs({
      extractor: getDbdExtractor(),
      vector: getVectorStore(),
      budgetMs: WORK_BUDGET_MS,
      slicePages: Number(process.env.TRANSCRIBE_SLICE_PAGES) || undefined,
    });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
