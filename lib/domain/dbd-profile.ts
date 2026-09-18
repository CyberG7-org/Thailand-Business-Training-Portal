import { z } from 'zod';
import { interviewProfileSchema, type InterviewProfile } from './bank-interview';

/**
 * Level 2 of the three-level DBD model (decision D38): the business profile that comes from the
 * objectives sheet, the shareholder list (บอจ.5) and the memorandum (บอจ.2). Stored in
 * `dbd_records.structured_data.business`; edited by admins as plain-text lists.
 */
const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optionalText = z.preprocess(emptyToNull, z.string().trim().max(500).nullable().default(null));
const optionalNumber = z.preprocess(
  emptyToNull,
  z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      const n = typeof v === 'number' ? v : Number(v.replace(/,/g, '').trim());
      if (!Number.isFinite(n) || n < 0) {
        ctx.addIssue({ code: 'custom', message: 'Must be a non-negative number' });
        return z.NEVER;
      }
      return n;
    })
    .nullable()
    .default(null),
);

export const objectiveSchema = z.object({
  no: z.number().int().positive().nullable().default(null),
  text: z.string().trim().min(1).max(2000),
});
export const shareholderSchema = z.object({
  name: z.string().trim().min(1).max(300),
  nationality: optionalText,
  shares: optionalNumber,
  percent: optionalNumber,
});
export const promoterSchema = z.object({
  name: z.string().trim().min(1).max(300),
  nationality: optionalText,
});
export const shareStructureSchema = z.object({
  total_shares: optionalNumber,
  par_value: optionalNumber,
  paid_up_capital: optionalNumber,
  share_type: optionalText,
});

export const businessProfileSchema = z.object({
  objectives: z.array(objectiveSchema).max(500).default([]),
  business_categories: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  share_structure: shareStructureSchema.default({
    total_shares: null,
    par_value: null,
    paid_up_capital: null,
    share_type: null,
  }),
  shareholders: z.array(shareholderSchema).max(500).default([]),
  promoters: z.array(promoterSchema).max(100).default([]),
});

export type BusinessProfile = z.output<typeof businessProfileSchema>;
export type Objective = z.output<typeof objectiveSchema>;
export type Shareholder = z.output<typeof shareholderSchema>;
export type Promoter = z.output<typeof promoterSchema>;

export const EMPTY_BUSINESS_PROFILE: BusinessProfile = businessProfileSchema.parse({});

/** Field → where the value was read (Level 3 "source page" and "AI confidence"). */
export type Provenance = Record<
  string,
  { confidence: number; source_page: number | null; source_document: number | null }
>;

export type StructuredData = {
  business?: BusinessProfile;
  /** Bank-interview answers the DBD cannot supply (decision D39). */
  interview?: InterviewProfile;
  document_type?: string | null;
  provenance?: Provenance;
};

/** Reads the JSON column defensively: anything malformed counts as empty. */
export function readStructuredData(raw: unknown): StructuredData {
  if (!raw || typeof raw !== 'object') return {};
  const data = raw as Record<string, unknown>;
  const business = businessProfileSchema.safeParse(data.business ?? {});
  const interview = interviewProfileSchema.safeParse(data.interview ?? {});
  return {
    business: business.success ? business.data : EMPTY_BUSINESS_PROFILE,
    interview: interview.success ? interview.data : interviewProfileSchema.parse({}),
    document_type: typeof data.document_type === 'string' ? data.document_type : null,
    provenance:
      data.provenance && typeof data.provenance === 'object' ? (data.provenance as Provenance) : {},
  };
}

export function isBusinessProfileEmpty(profile: BusinessProfile): boolean {
  const s = profile.share_structure;
  return (
    profile.objectives.length === 0 &&
    profile.business_categories.length === 0 &&
    profile.shareholders.length === 0 &&
    profile.promoters.length === 0 &&
    s.total_shares === null &&
    s.par_value === null &&
    s.paid_up_capital === null &&
    s.share_type === null
  );
}

// ---- Admin textarea formats ("one per line"; parts separated by " | ") -------------------

export function objectivesToText(objectives: Objective[]): string {
  return objectives.map((o) => (o.no === null ? o.text : `${o.no}. ${o.text}`)).join('\n');
}

export function parseObjectivesText(text: string): Objective[] {
  return lines(text).map((line) => {
    const m = /^(\d+)[.)]\s*(.+)$/.exec(line);
    return m ? { no: Number(m[1]), text: m[2].trim() } : { no: null, text: line };
  });
}

export function shareholdersToText(shareholders: Shareholder[]): string {
  return shareholders
    .map((s) =>
      [s.name, s.nationality ?? '', s.shares === null ? '' : String(s.shares)]
        .join(' | ')
        .replace(/(\s\|\s)+$/, ''),
    )
    .join('\n');
}

/** "Name | nationality | shares" per line; nationality and shares are optional. */
export function parseShareholdersText(text: string): Shareholder[] {
  return lines(text).map((line) => {
    const [name = '', nationality, shares] = line.split('|').map((s) => s.trim());
    const n = shares ? Number(shares.replace(/,/g, '')) : null;
    return {
      name,
      nationality: nationality ? nationality : null,
      shares: n !== null && Number.isFinite(n) ? n : null,
      percent: null,
    };
  });
}

export function promotersToText(promoters: Promoter[]): string {
  return promoters.map((p) => (p.nationality ? `${p.name} | ${p.nationality}` : p.name)).join('\n');
}

export function parsePromotersText(text: string): Promoter[] {
  return lines(text).map((line) => {
    const [name = '', nationality] = line.split('|').map((s) => s.trim());
    return { name, nationality: nationality ? nationality : null };
  });
}

export function listToText(items: string[]): string {
  return items.join('\n');
}

export function parseListText(text: string): string[] {
  return lines(text);
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
