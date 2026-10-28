import { describe, expect, it } from 'vitest';
import { MCQ_STARTER } from '@/lib/content/mcq-starter';
import { starterQuizTranslation } from '@/lib/content/mcq-manual-translations';
import { toVariant } from '@/lib/db/mcq-bank';
import type { QuestionWithLocalizations } from '@/lib/db/questions';
import { buildAttemptQuestions } from '@/lib/domain/mcq/attempt';
import { signature } from '@/lib/domain/mcq/grammar';
import { normalizeOption } from '@/lib/domain/mcq/format';
import { renderVariant } from '@/lib/domain/mcq/render';
import { SAMPLE_CONTEXT } from '@/lib/domain/mcq/sample';
import { OPTION_KEYS } from '@/lib/domain/mcq/variant';

describe('manual quiz languages', () => {
  it('covers all 90 starter variants with the same answer placeholders and four distinct choices', () => {
    for (const starter of MCQ_STARTER) {
      for (const language of ['ms', 'ta'] as const) {
        const translated = starterQuizTranslation(starter.conceptKey, language, starter.key);
        expect(translated, `${starter.key}:${language}`).not.toBeNull();
        const source = starter.texts.en!;
        for (const field of ['prompt', 'explanation', ...OPTION_KEYS] as const) {
          const english =
            field === 'prompt' || field === 'explanation' ? source[field]! : source.options[field];
          const wording =
            field === 'prompt' || field === 'explanation'
              ? translated![field]!
              : translated!.options[field];
          expect(signature(wording), `${starter.key}:${language}:${field}`).toBe(
            signature(english),
          );
        }
        const variant = {
          ...starter,
          id: starter.key,
          status: 'approved' as const,
          texts: { ...starter.texts, [language]: translated! },
        };
        const result = renderVariant(variant, SAMPLE_CONTEXT, 'same-seed', language);
        expect(result.ok, `${starter.key}:${language}`).toBe(true);
        if (result.ok) {
          expect(result.rendered.prompt).not.toBe(source.prompt);
          expect(
            new Set(result.rendered.options.map((choice) => normalizeOption(choice.text))).size,
          ).toBe(4);
        }
      }
    }
  });

  it('uses static translations only for an unchanged starter question', () => {
    const starter = MCQ_STARTER.find((item) => item.conceptKey === 'company_name')!;
    const english = starter.texts.en!;
    const row = {
      id: starter.key,
      question_key: starter.key,
      concept_key: starter.conceptKey,
      approval_status: 'approved',
      correct_option_key: starter.correctKey,
      option_recipes: starter.optionRecipes,
      applies_when: null,
      question_localizations: [
        {
          language: 'en',
          prompt: english.prompt,
          options: OPTION_KEYS.map((key) => ({ key, text: english.options[key] })),
          explanation: english.explanation,
        },
      ],
    } as unknown as QuestionWithLocalizations;
    expect(toVariant(row).texts.ms?.prompt).toContain('nama penuh');
    const edited = {
      ...row,
      question_localizations: [
        { ...row.question_localizations[0], prompt: 'Owner edited this question' },
      ],
    };
    expect(toVariant(edited).texts.ms).toBeUndefined();
    expect(toVariant(edited).texts.ta).toBeUndefined();
  });

  it('freezes Tamil and Malay versions with the same correct choice as Thai', () => {
    const bank = MCQ_STARTER.map((starter) => {
      const english = starter.texts.en!;
      return toVariant({
        id: starter.key,
        question_key: starter.key,
        concept_key: starter.conceptKey,
        approval_status: 'approved',
        correct_option_key: starter.correctKey,
        option_recipes: starter.optionRecipes,
        applies_when: null,
        question_localizations: [
          {
            language: 'en',
            prompt: english.prompt,
            options: OPTION_KEYS.map((key) => ({ key, text: english.options[key] })),
            explanation: english.explanation,
          },
          {
            language: 'th',
            prompt: starter.texts.th!.prompt,
            options: OPTION_KEYS.map((key) => ({ key, text: starter.texts.th!.options[key] })),
            explanation: starter.texts.th!.explanation,
          },
        ],
      } as unknown as QuestionWithLocalizations);
    });
    const { questions, missing } = buildAttemptQuestions(bank, SAMPLE_CONTEXT, 'manual-languages');
    expect(missing).toEqual([]);
    expect(questions).toHaveLength(30);
    for (const question of questions) {
      for (const language of ['ms', 'ta'] as const) {
        expect(
          question.localized[language]?.prompt,
          `${question.conceptKey}:${language}`,
        ).toBeTruthy();
        expect(question.localized[language]?.prompt).not.toBe(question.localized.en?.prompt);
        expect(question.localized[language]?.options.map((option) => option.key)).toEqual(
          question.localized.th.options.map((option) => option.key),
        );
        expect(
          question.localized[language]?.options.find(
            (option) => option.key === question.correctKey,
          ),
        ).toBeTruthy();
      }
    }
  });
});
