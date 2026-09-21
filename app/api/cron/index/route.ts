import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/db/admin';
import { processIndexJobs } from '@/lib/db/dbd-index';
import { extractAndApply } from '@/lib/db/extraction';
import { fillRecordFromTranscripts } from '@/lib/db/transcript-extraction';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import { ExtractionError } from '@/lib/integrations/extraction/types';
import { sweepPagesFromEnv } from '@/lib/integrations/extraction/transcript-schema';
import { getVectorStore } from '@/lib/integrations/vector';

// A 5-page slice of dense Thai can take 1–2 minutes and a whole-pack read up to 140 s; stop
// starting new work at 140 s of the 300 s ceiling so the call in flight always has room to
// finish and be persisted.
export const maxDuration = 300;
const WORK_BUDGET_MS = 140_000;
/** Outcomes a retry cannot change; the job is closed with the code as its reason. */
const TERMINAL_EXTRACTION = new Set(['not_allowed', 'no_document', 'too_large']);
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
    const extractor = getDbdExtractor();
    const vector = getVectorStore();
    const summary = await processIndexJobs({
      extractor,
      vector,
      budgetMs: WORK_BUDGET_MS,
      slicePages: slicePages(),
      // The direct read of a pack runs here too (D46): a request cannot wait for the model.
      extract: async ({ recordId }) => {
        if (!extractor) return { status: 'skipped' };
        try {
          await extractAndApply(createSupabaseAdminClient(), recordId, extractor, vector);
          return { status: 'done' };
        } catch (e) {
          if (e instanceof ExtractionError && TERMINAL_EXTRACTION.has(e.code)) {
            return { status: 'failed', error: e.code };
          }
          throw e;
        }
      },
      // Oversized documents fill their record from the transcripts once ready (spec §6, D42):
      // a resumable job of its own, sharing this run's budget.
      transcript: (input) =>
        fillRecordFromTranscripts(createSupabaseAdminClient(), input.recordId, {
          extractor,
          vector,
          budgetMs: input.budgetMs,
          facts: input.facts,
          sweepPages: sweepPagesFromEnv(),
        }),
    });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
