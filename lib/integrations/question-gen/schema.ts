import { z } from 'zod';
import { TEMPLATE_FIELDS } from '@/lib/domain/assessment/template';
import { DBD_CERTIFICATE_REFERENCE } from './dbd-reference';

const option = z.object({ key: z.enum(['A', 'B', 'C', 'D']), text: z.string() });

export const localizationSchema = z.object({
  prompt: z.string(),
  options: z.array(option),
  correct_key: z.enum(['A', 'B', 'C', 'D']),
  explanation: z.string(),
});

export const generatedQuestionSchema = z.object({
  kind: z.enum(['generic', 'dbd_template']),
  localizations: z.object({
    th: localizationSchema,
    en: localizationSchema,
    zh: localizationSchema,
  }),
});

/** Structured output for a generation run. */
export const generationOutputSchema = z.object({
  questions: z.array(generatedQuestionSchema),
});

/** Structured output for a translation run (only the requested languages are read). */
export const translationOutputSchema = z.object({
  th: localizationSchema.nullable(),
  en: localizationSchema.nullable(),
  zh: localizationSchema.nullable(),
});

export type GenerationOutput = z.infer<typeof generationOutputSchema>;
export type TranslationOutput = z.infer<typeof translationOutputSchema>;

const PLACEHOLDER_GUIDE = `Template questions personalize themselves with the learner's own company record. Write placeholders
exactly as {field} inside the prompt or an option; the app substitutes the learner's value. Available fields:
${TEMPLATE_FIELDS.map((f) => `- {${f}}`).join('\n')}
A distractor variant is written after a pipe and is derived from the real value, so wrong options stay plausible:
- numbers: {registered_capital|x2}, {registered_capital|x0.5}
- dates: {registered_on|+1m}, {issued_on|-1y}, {issued_on|+10d}
- lists: {directors|shuffle}
Use the SAME placeholders in all three languages (placeholders are never translated). Only use fields from the list.`;

export const GENERATION_INSTRUCTIONS = `You write multiple-choice training questions for Thai company directors who must prove to a bank
officer that they know their own company's registration facts as printed on the DBD certificate.

${DBD_CERTIFICATE_REFERENCE}

Rules:
- Return exactly the requested number of questions; exactly the requested number of them must be kind "dbd_template", the rest "generic".
- Every question has exactly 4 options with keys A, B, C, D and exactly one correct option; correct_key is the same letter in every language.
- Provide each question in Thai (th), English (en) and Simplified Chinese (zh). Options keep the same order and meaning across languages.
- Thai is the primary language: natural, polite, clear. English and Chinese are faithful translations.
- Every "dbd_template" question asks for a particular of the learner's OWN certificate and MUST express every
  company-specific value through placeholders — never write a literal company name, number, address, date or person
  from the reference example into a question or option; other learners will see the same question with their own values.
- Ground generic questions in the certificate description above and in the provided material when material is given;
  do not invent facts. When a reference example is given, use it only to understand the layout and typical values.
- No trick questions, no "all/none of the above", no ambiguous wording.
- explanation: one or two sentences shown to a learner who answered wrongly (in that language).

${PLACEHOLDER_GUIDE}`;

export const TRANSLATION_INSTRUCTIONS = `Translate a multiple-choice question into the requested languages. Keep option keys and order,
keep the same correct_key, and copy every {placeholder} or {placeholder|variant} EXACTLY as written — never translate or reorder
what is inside the braces. Thai must read naturally and politely; Chinese is Simplified. Return null for languages that were not requested.`;
