import type { SupabaseClient } from '@supabase/supabase-js';
import type { Recipe } from '@/lib/domain/mcq/tokens';
import { validateVariant, type VariantIssue } from '@/lib/domain/mcq/validate';
import {
  OPTION_KEYS,
  VARIANT_LOCALES,
  type AppliesWhen,
  type StarterVariant,
  type Variant,
  type VariantDraft,
  type VariantOptionKey,
  type VariantStatus,
  type VariantText,
} from '@/lib/domain/mcq/variant';
import type { Locale } from '@/lib/domain/thai-date';
import type { Database, Json } from './database.types';
import type { QuestionWithLocalizations } from './questions';

type Db = SupabaseClient<Database>;

const SELECT = '*, question_localizations(*)';

/** A save or an approval the rules refuse; `issues` says what and where. */
export class VariantError extends Error {
  constructor(public readonly issues: VariantIssue[]) {
    super(issues.map((i) => `${i.code}@${i.where}`).join(', '));
    this.name = 'VariantError';
  }
}

export type VariantInput = VariantDraft & { id: string | null };

/** A stored row as the domain's `Variant`. Written only by `saveVariant`, so the shape is trusted. */
export function toVariant(row: QuestionWithLocalizations): Variant {
  const texts: Variant['texts'] = {};
  for (const loc of row.question_localizations) {
    const stored = loc.options as unknown as { key: string; text: string }[];
    const options = Object.fromEntries(
      OPTION_KEYS.map((key) => [key, stored.find((o) => o.key === key)?.text ?? '']),
    ) as Record<VariantOptionKey, string>;
    texts[loc.language as Locale] = {
      prompt: loc.prompt,
      options,
      explanation: loc.explanation,
    };
  }
  return {
    id: row.id,
    key: row.question_key,
    conceptKey: row.concept_key ?? '',
    status: row.approval_status as VariantStatus,
    correctKey: row.correct_option_key as VariantOptionKey,
    optionRecipes: row.option_recipes as unknown as Record<VariantOptionKey, Recipe>,
    appliesWhen: (row.applies_when as unknown as AppliesWhen | null) ?? null,
    texts,
  };
}

export async function listVariants(db: Db): Promise<Variant[]> {
  const { data, error } = await db
    .from('questions')
    .select(SELECT)
    .not('concept_key', 'is', null)
    .order('question_key');
  if (error) throw error;
  return (data as QuestionWithLocalizations[]).map(toVariant);
}

export async function getVariant(db: Db, id: string): Promise<Variant | null> {
  const { data, error } = await db
    .from('questions')
    .select(SELECT)
    .eq('id', id)
    .not('concept_key', 'is', null)
    .maybeSingle();
  if (error) throw error;
  return data ? toVariant(data as QuestionWithLocalizations) : null;
}

const structure = (v: VariantDraft) => ({
  correct_option_key: v.correctKey,
  option_recipes: v.optionRecipes as unknown as Json,
  applies_when: (v.appliesWhen as unknown as Json) ?? null,
});

/** `mcq-<concept>-<n>`: the next free number for the concept. */
async function insertVariant(
  db: Db,
  input: VariantDraft,
  actorId: string,
  fixedKey: string | null,
): Promise<string> {
  const prefix = `mcq-${input.conceptKey.replaceAll('_', '-')}-`;
  let next = 1;
  if (!fixedKey) {
    const { data, error } = await db
      .from('questions')
      .select('question_key')
      .like('question_key', `${prefix}%`);
    if (error) throw error;
    const numbers = data
      .map((r) => Number(r.question_key.slice(prefix.length)))
      .filter((n) => Number.isInteger(n));
    next = Math.max(0, ...numbers) + 1;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db
      .from('questions')
      .insert({
        question_key: fixedKey ?? `${prefix}${next + attempt}`,
        kind: 'concept',
        concept_key: input.conceptKey,
        pools: [],
        created_by: actorId,
        ...structure(input),
      })
      .select('id')
      .single();
    if (!error) return data.id;
    // Someone took the number in between: try the next one. A fixed key is not retried.
    if (error.code !== '23505' || fixedKey) throw error;
  }
  throw new Error(`could not allocate a key for ${input.conceptKey}`);
}

async function writeTexts(db: Db, id: string, input: VariantDraft): Promise<void> {
  for (const locale of VARIANT_LOCALES) {
    const text: VariantText | undefined = input.texts[locale];
    if (!text) {
      // A translation that is no longer sent is removed; the Thai text is never absent here.
      const { error } = await db
        .from('question_localizations')
        .delete()
        .eq('question_id', id)
        .eq('language', locale);
      if (error) throw error;
      continue;
    }
    const { error } = await db.from('question_localizations').upsert(
      {
        question_id: id,
        language: locale,
        prompt: text.prompt.trim(),
        options: OPTION_KEYS.map((key) => ({
          key,
          text: text.options[key].trim(),
        })) as unknown as Json,
        correct_key: input.correctKey,
        explanation: text.explanation?.trim() || null,
        tts_enabled: false,
      },
      { onConflict: 'question_id,language' },
    );
    if (error) throw error;
  }
}

/**
 * Creates or updates a variant under the caller's own session, so RLS admits only the Owner and
 * the audit names them. Nothing invalid is stored: a draft always keeps every rule. The
 * database returns an approved variant to draft when its Thai text or structure changed.
 */
export async function saveVariant(db: Db, input: VariantInput, actorId: string): Promise<string> {
  const issues = validateVariant(input);
  if (issues.length > 0) throw new VariantError(issues);
  let id = input.id;
  if (id) {
    const { data, error } = await db
      .from('questions')
      .update(structure(input))
      .eq('id', id)
      .not('concept_key', 'is', null)
      .select('id');
    if (error) throw error;
    if (data.length === 0) throw new Error('variant not found');
  } else {
    id = await insertVariant(db, input, actorId, null);
  }
  await writeTexts(db, id, input);
  return id;
}

/** Approve (after the rules are checked again), return to draft, or retire. */
export async function setVariantStatus(db: Db, id: string, status: VariantStatus): Promise<void> {
  if (status === 'approved') {
    const variant = await getVariant(db, id);
    if (!variant) throw new Error('variant not found');
    const issues = validateVariant(variant);
    if (issues.length > 0) throw new VariantError(issues);
  }
  const { data, error } = await db
    .from('questions')
    .update({ approval_status: status })
    .eq('id', id)
    .not('concept_key', 'is', null)
    .select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error('variant not found');
}

/** A draft that may be approved as it stands: its Thai text is written and it keeps every rule. */
export const isCheckedDraft = (variant: Variant): boolean =>
  variant.status === 'draft' && Boolean(variant.texts.th) && validateVariant(variant).length === 0;

/**
 * Approves every checked draft, one by one under the caller's own session, so RLS admits only
 * the Owner and the audit names them (D99). A draft that breaks a rule is left as a draft.
 */
export async function approveCheckedDrafts(
  db: Db,
): Promise<{ approved: string[]; skipped: string[] }> {
  const drafts = (await listVariants(db)).filter((v) => v.status === 'draft');
  const approved: string[] = [];
  const skipped: string[] = [];
  for (const variant of drafts) {
    if (!isCheckedDraft(variant)) {
      skipped.push(variant.key);
      continue;
    }
    await setVariantStatus(db, variant.id, 'approved');
    approved.push(variant.key);
  }
  return { approved, skipped };
}

/**
 * Adds the starter drafts that are not in the bank yet, each under its own key. A key that
 * exists is left alone, so loading again never overwrites what the Owner has edited.
 */
export async function loadStarterVariants(
  db: Db,
  starters: readonly StarterVariant[],
  actorId: string,
): Promise<{ created: string[]; skipped: string[] }> {
  const { data, error } = await db
    .from('questions')
    .select('question_key')
    .in(
      'question_key',
      starters.map((s) => s.key),
    );
  if (error) throw error;
  const existing = new Set(data.map((r) => r.question_key));
  const created: string[] = [];
  const skipped: string[] = [];
  for (const starter of starters) {
    if (existing.has(starter.key)) {
      skipped.push(starter.key);
      continue;
    }
    const issues = validateVariant(starter);
    if (issues.length > 0) throw new VariantError(issues);
    const id = await insertVariant(db, starter, actorId, starter.key);
    await writeTexts(db, id, starter);
    created.push(starter.key);
  }
  return { created, skipped };
}
