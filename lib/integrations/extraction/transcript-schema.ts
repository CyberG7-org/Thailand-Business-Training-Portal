import { z } from 'zod';
import { DOCUMENT_TYPES } from './schema';

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Classification of one document from its first transcribed page (spec §5.6). */
export const classifyApiSchema = z.object({ document_type: z.enum(DOCUMENT_TYPES) });

/** Union-free lists for one batch of transcript pages; empty sentinels "" / 0 as in the flat schema. */
export const sweepApiSchema = z.object({
  objectives: z.array(z.object({ no: z.number().int(), text: z.string() })),
  shareholders: z.array(
    z.object({
      name: z.string(),
      nationality: z.string(),
      shares: z.number(),
      percent: z.number(),
    }),
  ),
  promoters: z.array(z.object({ name: z.string(), nationality: z.string() })),
  share_structure: z.object({
    total_shares: z.number(),
    par_value: z.number(),
    paid_up_capital: z.number(),
    share_type: z.string(),
  }),
});
export type SweepApi = z.infer<typeof sweepApiSchema>;

export type SweepResult = {
  objectives: { no: number | null; text: string }[];
  shareholders: {
    name: string;
    nationality: string | null;
    shares: number | null;
    percent: number | null;
  }[];
  promoters: { name: string; nationality: string | null }[];
  share_structure: {
    total_shares: number | null;
    par_value: number | null;
    paid_up_capital: number | null;
    share_type: string | null;
  };
};

const textOrNull = (s: string) => (s.trim() === '' ? null : s);
const numberOrNull = (n: number) => (n === 0 ? null : n);

export function fromSweepApi(api: SweepApi): SweepResult {
  return {
    objectives: api.objectives.map((o) => ({ no: o.no > 0 ? o.no : null, text: o.text })),
    shareholders: api.shareholders.map((s) => ({
      name: s.name,
      nationality: textOrNull(s.nationality),
      shares: numberOrNull(s.shares),
      percent: numberOrNull(s.percent),
    })),
    promoters: api.promoters.map((p) => ({ name: p.name, nationality: textOrNull(p.nationality) })),
    share_structure: {
      total_shares: numberOrNull(api.share_structure.total_shares),
      par_value: numberOrNull(api.share_structure.par_value),
      paid_up_capital: numberOrNull(api.share_structure.paid_up_capital),
      share_type: textOrNull(api.share_structure.share_type),
    },
  };
}

export const EMPTY_SWEEP: SweepResult = {
  objectives: [],
  shareholders: [],
  promoters: [],
  share_structure: { total_shares: null, par_value: null, paid_up_capital: null, share_type: null },
};

/** Batches in page order → one list per kind; rows repeated across a page break appear once. */
export function mergeSweeps(results: SweepResult[]): SweepResult {
  const out: SweepResult = structuredClone(EMPTY_SWEEP);
  const seenObjective = new Set<string>();
  const seenPerson = new Set<string>();
  const seenPromoter = new Set<string>();
  for (const r of results) {
    for (const o of r.objectives) {
      const key = `${o.no ?? ''}|${o.text.trim()}`;
      if (seenObjective.has(key)) continue;
      seenObjective.add(key);
      out.objectives.push(o);
    }
    for (const s of r.shareholders) {
      const key = `${s.name.trim()}|${s.nationality ?? ''}`;
      if (seenPerson.has(key)) continue;
      seenPerson.add(key);
      out.shareholders.push(s);
    }
    for (const p of r.promoters) {
      const key = `${p.name.trim()}|${p.nationality ?? ''}`;
      if (seenPromoter.has(key)) continue;
      seenPromoter.add(key);
      out.promoters.push(p);
    }
    for (const k of ['total_shares', 'par_value', 'paid_up_capital', 'share_type'] as const) {
      if (out.share_structure[k] === null && r.share_structure[k] !== null) {
        (out.share_structure as Record<string, unknown>)[k] = r.share_structure[k];
      }
    }
  }
  return out;
}

export const CLASSIFY_INSTRUCTIONS = `This is the first page of one document from a Thai DBD company pack. Classify it: "certificate" (หนังสือรับรอง),
"objectives_sheet" (วัตถุที่ประสงค์), "shareholder_list" (บัญชีรายชื่อผู้ถือหุ้น, บอจ.5), "memorandum" (หนังสือบริคณห์สนธิ, บอจ.2),
"articles" (ข้อบังคับ) or "other" (blank, unreadable, or anything else).`;

export const FACTS_INSTRUCTIONS = `You receive passages transcribed from a Thai DBD company pack, each labelled with its document number and page.
Extract the company's registered particulars exactly as printed, following the same rules as for a full document pack:
never invent, empty sentinels for anything not printed, and one provenance entry per field you read with the
document number and page of the passage it came from. Leave the list fields (objectives, shareholders, promoters)
empty — they are read separately.`;

export const SWEEP_INSTRUCTIONS = `You receive consecutive transcribed pages of ONE Thai DBD document. Return every list row printed on these pages,
in order, exactly as printed: objectives (numbered; no 0 when unnumbered), shareholders (name, nationality, number
of shares, percentage — 0 when not printed), promoters (ผู้เริ่มก่อการ), and the share structure figures if printed
(0 / "" otherwise). Rows continue across pages: return what these pages show; never invent or complete a row.`;
