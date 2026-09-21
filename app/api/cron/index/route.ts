import { NextResponse, type NextRequest } from 'next/server';
import { processIndexJobs } from '@/lib/db/dbd-index';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import { getVectorStore } from '@/lib/integrations/vector';

// A 5-page slice of dense Thai can take 1–2 minutes; stop starting new slices at half the
// 300 s ceiling so the slice in flight always has room to finish and be persisted.
export const maxDuration = 300;
const WORK_BUDGET_MS = 150_000;
const MAX_SLICE_PAGES = 100; // Anthropic's per-request page limit

function slicePages(): number | undefined {
  const n = Number(process.env.TRANSCRIBE_SLICE_PAGES);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(Math.floor(n), MAX_SLICE_PAGES);
}

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
      slicePages: slicePages(),
    });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
