'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { MCQ_STARTER } from '@/lib/content/mcq-starter';
import {
  loadStarterVariants,
  saveVariant,
  setVariantStatus,
  VariantError,
} from '@/lib/db/mcq-bank';
import { createSupabaseServerClient } from '@/lib/db/server';
import { STATUS_FACTS, type StatusFact } from '@/lib/domain/facts/fact-sheet';
import { RECIPES } from '@/lib/domain/mcq/tokens';
import type { VariantIssue } from '@/lib/domain/mcq/validate';
import {
  inheritPlaceholders,
  OPTION_KEYS,
  VARIANT_LOCALES,
  type Variant,
  type VariantOptionKey,
  type VariantText,
} from '@/lib/domain/mcq/variant';
import type { Locale } from '@/lib/domain/thai-date';

export type StarterState = { done: boolean; created: number; failed: boolean };

/** Adds the starter drafts that are not in the bank yet, under the Owner's own session. */
export async function loadStarterAction(
  _prev: StarterState,
  formData: FormData,
): Promise<StarterState> {
  const locale = String(formData.get('locale') ?? 'th');
  const owner = await requireAdmin(locale);
  try {
    const { created } = await loadStarterVariants(
      await createSupabaseServerClient(),
      MCQ_STARTER,
      owner.id,
    );
    revalidatePath(`/${locale}/admin/questions`);
    return { done: true, created: created.length, failed: false };
  } catch (e) {
    console.error('starter drafts', e);
    return { done: false, created: 0, failed: true };
  }
}

/**
 * `values` carries what was typed back to the form when a save is refused: React resets an
 * uncontrolled form after its action, and an editor must not lose the Owner's text to a rule.
 */
export type VariantState = {
  ok: boolean;
  failed: boolean;
  issues: VariantIssue[];
  values: Record<string, string> | null;
};

const recipe = z.enum(RECIPES);
const structureSchema = z.object({
  conceptKey: z.string().min(1).max(60),
  correctKey: z.enum(OPTION_KEYS),
  optionRecipes: z.object({ A: recipe, B: recipe, C: recipe, D: recipe }),
  appliesWhen: z
    .string()
    .regex(/^([a-z_]+):(true|false)$/)
    .refine((v) => (STATUS_FACTS as readonly string[]).includes(v.split(':')[0]))
    .nullable(),
});

function readText(formData: FormData, locale: Locale): VariantText | null {
  const field = (name: string) => String(formData.get(`${locale}_${name}`) ?? '').trim();
  const options = Object.fromEntries(
    OPTION_KEYS.map((key) => [key, field(`option_${key}`)]),
  ) as Record<VariantOptionKey, string>;
  const text = { prompt: field('prompt'), options, explanation: field('explanation') || null };
  // A translation nobody wrote is absent, not blank; the Thai text is always there to be checked.
  const blank = !text.prompt && !text.explanation && OPTION_KEYS.every((key) => !options[key]);
  return locale !== 'th' && blank ? null : text;
}

/** Creates or updates a variant under the Owner's own session; every rule is checked first. */
export async function saveVariantAction(
  _prev: VariantState,
  formData: FormData,
): Promise<VariantState> {
  const locale = String(formData.get('locale') ?? 'th');
  const owner = await requireAdmin(locale);
  const id = String(formData.get('id') ?? '') || null;
  const values = Object.fromEntries(
    [...formData.entries()].filter((e): e is [string, string] => typeof e[1] === 'string'),
  );
  const refused = (issues: VariantIssue[], failed: boolean): VariantState => ({
    ok: false,
    failed,
    issues,
    values,
  });
  const parsed = structureSchema.safeParse({
    conceptKey: formData.get('conceptKey'),
    correctKey: formData.get('correctKey'),
    optionRecipes: Object.fromEntries(
      OPTION_KEYS.map((key) => [key, formData.get(`recipe_${key}`)]),
    ),
    appliesWhen: String(formData.get('appliesWhen') ?? '') || null,
  });
  if (!parsed.success) return refused([], true);
  const texts: Variant['texts'] = {};
  for (const language of VARIANT_LOCALES) {
    const text = readText(formData, language);
    if (text) texts[language] = text;
  }
  const [fact, value] = parsed.data.appliesWhen?.split(':') ?? [];
  let savedId: string;
  try {
    savedId = await saveVariant(
      await createSupabaseServerClient(),
      {
        id,
        conceptKey: parsed.data.conceptKey,
        correctKey: parsed.data.correctKey,
        optionRecipes: parsed.data.optionRecipes,
        appliesWhen: fact ? { fact: fact as StatusFact, value: value === 'true' } : null,
        texts: inheritPlaceholders(texts),
      },
      owner.id,
    );
  } catch (e) {
    if (e instanceof VariantError) return refused(e.issues, false);
    console.error('variant save', e);
    return refused([], true);
  }
  revalidatePath(`/${locale}/admin/questions`);
  if (!id) redirect(`/${locale}/admin/questions/variants/${savedId}`);
  revalidatePath(`/${locale}/admin/questions/variants/${savedId}`);
  return { ok: true, failed: false, issues: [], values: null };
}

export type StatusState = { failed: boolean; issues: VariantIssue[] };

/** Approve, return to draft or retire; an approval checks the rules again. */
export async function setVariantStatusAction(
  _prev: StatusState,
  formData: FormData,
): Promise<StatusState> {
  const locale = String(formData.get('locale') ?? 'th');
  await requireAdmin(locale);
  const id = String(formData.get('id') ?? '');
  const status = formData.get('status');
  if (status !== 'draft' && status !== 'approved' && status !== 'retired') {
    return { failed: true, issues: [] };
  }
  try {
    await setVariantStatus(await createSupabaseServerClient(), id, status);
  } catch (e) {
    if (e instanceof VariantError) return { failed: false, issues: e.issues };
    console.error('variant status', e);
    return { failed: true, issues: [] };
  }
  revalidatePath(`/${locale}/admin/questions`);
  revalidatePath(`/${locale}/admin/questions/variants/${id}`);
  return { failed: false, issues: [] };
}
