'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { StatusFact } from '@/lib/domain/facts/fact-sheet';
import { RECIPES } from '@/lib/domain/mcq/tokens';
import type { VariantIssue } from '@/lib/domain/mcq/validate';
import { OPTION_KEYS, type Variant } from '@/lib/domain/mcq/variant';
import { saveVariantAction, type VariantState } from './bank-actions';

const initial: VariantState = { ok: false, failed: false, issues: [], values: null };

export function IssueList({ issues }: { issues: VariantIssue[] }) {
  const t = useTranslations('admin.bank');
  if (issues.length === 0) return null;
  // `th.B` → "Thai · Option B"; a bare place (`concept`, `appliesWhen`) needs no label.
  const place = (where: string) => {
    const [language, field] = where.split('.');
    if (!field) return '';
    const label =
      field === 'prompt'
        ? t('variant.prompt')
        : field === 'explanation'
          ? t('where.explanation')
          : t('variant.option', { key: field });
    return `${t(`where.${language}` as 'where.th')} · ${label}`;
  };
  // A grammar detail is `code: {what was typed}`; a mismatch names the recipe the text is.
  const cause = (issue: VariantIssue) => {
    if (issue.code === 'grammar') {
      const at = issue.detail.indexOf(': ');
      return t(`grammar.${issue.detail.slice(0, at)}` as 'grammar.unknown_token', {
        raw: issue.detail.slice(at + 2),
      });
    }
    if (issue.code === 'recipe_mismatch') {
      return t(`recipes.${issue.detail}` as 'recipes.STATIC');
    }
    return issue.detail;
  };
  return (
    <ul role="alert" data-testid="variant-issues" className="staff-notice-bad grid gap-1 text-sm">
      {issues.map((issue) => (
        <li key={`${issue.code}@${issue.where}`} data-code={issue.code} data-where={issue.where}>
          {t(`issues.${issue.code}` as 'issues.grammar', {
            where: place(issue.where),
            detail: cause(issue),
          })}
        </li>
      ))}
    </ul>
  );
}

/**
 * One variant: the Thai text it is approved on with the four options, their recipes and the
 * correct one; then the two reference translations. Inputs are solid, never glass (design brief).
 */
export function VariantForm({
  conceptKey,
  statusFacts,
  variant,
}: {
  conceptKey: string;
  statusFacts: readonly StatusFact[];
  variant: Variant | null;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.bank');
  const [state, formAction, pending] = useActionState(saveVariantAction, initial);
  // What was typed in a refused save wins over what is stored.
  const value = (name: string, stored: string) => state.values?.[name] ?? stored;
  const stored = (language: 'th' | 'en' | 'zh') => variant?.texts[language];
  const applies = variant?.appliesWhen
    ? `${variant.appliesWhen.fact}:${variant.appliesWhen.value}`
    : '';
  return (
    <form action={formAction} className="grid gap-4" data-testid="variant-form">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={variant?.id ?? ''} />
      <input type="hidden" name="conceptKey" value={conceptKey} />

      <fieldset className="staff-card grid gap-3">
        <legend className="px-1 text-sm font-semibold">{t('variant.thai')}</legend>
        <label className="text-sm">
          {t('variant.prompt')}
          <textarea
            name="th_prompt"
            rows={2}
            required
            defaultValue={value('th_prompt', stored('th')?.prompt ?? '')}
            className="staff-input mt-1"
          />
        </label>
        {OPTION_KEYS.map((key) => (
          <div key={key} className="grid gap-2 md:grid-cols-[auto_1fr_15rem] md:items-end">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="correctKey"
                value={key}
                defaultChecked={value('correctKey', variant?.correctKey ?? 'A') === key}
              />
              {t('variant.correct')}
            </label>
            <label className="text-sm">
              {t('variant.option', { key })}
              <input
                name={`th_option_${key}`}
                defaultValue={value(`th_option_${key}`, stored('th')?.options[key] ?? '')}
                className="staff-input mt-1"
              />
            </label>
            <label className="text-sm">
              {t('variant.recipe')}
              <select
                name={`recipe_${key}`}
                defaultValue={value(
                  `recipe_${key}`,
                  variant?.optionRecipes[key] ?? (key === 'A' ? 'DIRECT_FACT' : 'STATIC'),
                )}
                className="staff-input mt-1"
              >
                {RECIPES.map((recipe) => (
                  <option key={recipe} value={recipe}>
                    {t(`recipes.${recipe}` as 'recipes.STATIC')}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
        <label className="text-sm">
          {t('variant.explanation')}
          <textarea
            name="th_explanation"
            rows={2}
            defaultValue={value('th_explanation', stored('th')?.explanation ?? '')}
            className="staff-input mt-1"
          />
        </label>
        {statusFacts.length > 0 && (
          <label className="text-sm">
            {t('variant.appliesWhen')}
            <select
              name="appliesWhen"
              defaultValue={value('appliesWhen', applies)}
              className="staff-input mt-1"
            >
              <option value="">{t('caseAlways')}</option>
              {statusFacts.flatMap((fact) =>
                [true, false].map((flag) => (
                  <option key={`${fact}:${flag}`} value={`${fact}:${flag}`}>
                    {t(flag ? 'caseYes' : 'caseNo', {
                      fact: t(`statusFacts.${fact}` as 'statusFacts.operations_started'),
                    })}
                  </option>
                )),
              )}
            </select>
          </label>
        )}
      </fieldset>

      {(['en', 'zh'] as const).map((language) => (
        <details
          key={language}
          open={Boolean(stored(language)) || Boolean(state.values?.[`${language}_prompt`])}
          className="staff-card"
          data-testid={`variant-${language}`}
        >
          <summary className="cursor-pointer text-sm font-semibold">
            {t(language === 'en' ? 'variant.english' : 'variant.chinese')}
          </summary>
          <div className="mt-3 grid gap-3">
            <label className="text-sm">
              {t('variant.prompt')}
              <textarea
                name={`${language}_prompt`}
                rows={2}
                defaultValue={value(`${language}_prompt`, stored(language)?.prompt ?? '')}
                className="staff-input mt-1"
              />
            </label>
            {OPTION_KEYS.map((key) => (
              <label key={key} className="text-sm">
                {t('variant.option', { key })}
                <input
                  name={`${language}_option_${key}`}
                  defaultValue={value(
                    `${language}_option_${key}`,
                    stored(language)?.options[key] ?? '',
                  )}
                  className="staff-input mt-1"
                />
              </label>
            ))}
            <p className="text-sm text-ink-700">{t('variant.inheritHint')}</p>
            <label className="text-sm">
              {t('variant.explanation')}
              <textarea
                name={`${language}_explanation`}
                rows={2}
                defaultValue={value(`${language}_explanation`, stored(language)?.explanation ?? '')}
                className="staff-input mt-1"
              />
            </label>
          </div>
        </details>
      ))}

      <IssueList issues={state.issues} />
      {state.failed && (
        <p role="alert" className="text-sm text-bad-600">
          {t('issues.failed')}
        </p>
      )}
      {state.ok && (
        <p role="status" data-testid="variant-saved" className="text-sm text-ok-600">
          {t('variant.saved')}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="variant-save"
        className="staff-btn justify-self-start"
      >
        {t('variant.save')}
      </button>
    </form>
  );
}
