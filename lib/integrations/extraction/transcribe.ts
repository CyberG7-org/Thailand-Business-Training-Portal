import type { Slice } from '@/lib/domain/rag/transcript';

/** Fast, strong at reading scans; Opus stays the structured extractor (decision D41). */
export const DEFAULT_TRANSCRIPTION_MODEL = 'claude-sonnet-5';

export function transcriptionModel(env: Record<string, string | undefined> = process.env): string {
  return env.TRANSCRIPTION_MODEL || DEFAULT_TRANSCRIPTION_MODEL;
}

/** Plain-text transcript with page markers: fewer tokens than JSON and no escaping of Thai. */
export function transcriptionPrompt(range: Slice): string {
  const markers: string[] = [];
  for (let page = range.firstPage; page <= range.lastPage; page++) {
    markers.push(`=== PAGE ${page} ===`);
  }
  return [
    `This PDF holds pages ${range.firstPage}–${range.lastPage} of a Thai company-registration document pack (DBD, กรมพัฒนาธุรกิจการค้า). The first page of this PDF is page ${range.firstPage} of the original file.`,
    'Transcribe every page completely, in reading order, exactly as printed:',
    '- Keep the Thai text verbatim: spelling, numbers, Buddhist-era dates and punctuation. Do not translate, summarise or correct anything.',
    '- Write tables as one row per line with cells separated by " | ".',
    '- Note stamps, seals and signatures as [ตราประทับ] or [ลายมือชื่อ]; describe nothing else.',
    '- A blank or unreadable page still gets its marker, followed by [หน้าว่าง] or [อ่านไม่ออก].',
    `Start each page with a marker line of exactly === PAGE n === using the original page number. Output these markers in this order and nothing before the first one: ${markers.join(', ')}.`,
  ].join('\n');
}
