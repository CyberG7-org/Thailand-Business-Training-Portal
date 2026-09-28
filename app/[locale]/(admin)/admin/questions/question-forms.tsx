'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { AppLocale } from '@/i18n/routing';
import type { QuestionLocalizationRow, QuestionRow } from '@/lib/db/questions';
import type { QuestionOption } from '@/lib/domain/assessment/engine';
import {
  fillMissingLanguagesAction,
  saveQuestionAction,
  saveQuestionLocalizationAction,
  setApprovalAction,
  type FillState,
  type QuestionState,
} from './actions';

const initial: QuestionState = { ok: false, error: null };
const LANGUAGE_LABELS: Record<AppLocale, string> = { th: 'ไทย', en: 'English', zh: '中文' };
const KEYS = ['A', 'B', 'C', 'D'] as const;
const PLACEHOLDER_EXAMPLES =
  '{company_name_th} {juristic_id} {registered_capital} {issued_on} {registered_on} {directors} {head_office_address} · {registered_capital|x2} {issued_on|+1m} {juristic_id|shuffle}';

function Feedback({ state, savedLabel }: { state: QuestionState; savedLabel: string }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-bad-600">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="text-sm text-ok-600">
        {savedLabel}
      </p>
    );
  }
  return null;
}

export function QuestionForm({ question }: { question: QuestionRow | null }) {
  const locale = useLocale();
  const t = useTranslations('admin.questions');
  const [state, formAction, pending] = useActionState(saveQuestionAction, initial);
  return (
    <form action={formAction} className="staff-card grid max-w-md gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={question?.id ?? ''} />
      <label className="text-sm">
        {t('key')}
        <input
          name="questionKey"
          defaultValue={question?.question_key ?? ''}
          readOnly={question !== null}
          required
          className="staff-input mt-1"
        />
      </label>
      <fieldset className="text-sm">
        <legend>{t('pools')}</legend>
        <label className="mr-4">
          <input
            type="checkbox"
            name="pools"
            value="quiz"
            defaultChecked={question?.pools.includes('quiz') ?? true}
          />{' '}
          {t('poolQuiz')}
        </label>
        <label>
          <input
            type="checkbox"
            name="pools"
            value="exam"
            defaultChecked={question?.pools.includes('exam') ?? true}
          />{' '}
          {t('poolExam')}
        </label>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input name="active" type="checkbox" defaultChecked={question?.active ?? true} />
        {t('active')}
      </label>
      {question && (
        <p className="text-xs text-ink-500" data-testid="question-dependencies">
          {t('kind')}: {question.kind} · {t('dependencies')}:{' '}
          {question.dbd_field_dependencies.join(', ') || '—'}
        </p>
      )}
      <Feedback state={state} savedLabel={t('saved')} />
      <button type="submit" disabled={pending} className="staff-btn">
        {t('save')}
      </button>
    </form>
  );
}

export function ApprovalForm({ question }: { question: QuestionRow }) {
  const locale = useLocale();
  const t = useTranslations('admin.questions');
  const [state, formAction, pending] = useActionState(setApprovalAction, initial);
  return (
    <form action={formAction} className="staff-card grid max-w-md gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="questionId" value={question.id} />
      <p className="text-sm">
        {t('status')}: <span data-testid="question-status">{question.approval_status}</span>
      </p>
      <select name="status" defaultValue={question.approval_status} className="staff-input">
        <option value="draft">draft</option>
        <option value="approved">approved</option>
        <option value="retired">retired</option>
      </select>
      <p className="text-xs text-ink-500">{t('approvalHint')}</p>
      <Feedback state={state} savedLabel={t('saved')} />
      <button type="submit" disabled={pending} data-testid="set-status" className="staff-btn-ghost">
        {t('setStatus')}
      </button>
    </form>
  );
}

export function QuestionLocalizationForm({
  questionId,
  language,
  localization,
}: {
  questionId: string;
  language: AppLocale;
  localization: QuestionLocalizationRow | null;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.questions');
  const [state, formAction, pending] = useActionState(saveQuestionLocalizationAction, initial);
  const options = (localization?.options as unknown as QuestionOption[] | undefined) ?? [];
  const textFor = (key: string) => options.find((o) => o.key === key)?.text ?? '';
  return (
    <form action={formAction} className="staff-card grid gap-2" data-testid={`qloc-${language}`}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="questionId" value={questionId} />
      <input type="hidden" name="language" value={language} />
      <h3 className="font-semibold">
        {LANGUAGE_LABELS[language]}
        {localization ? '' : ` — ${t('missing')}`}
      </h3>
      <label className="text-sm">
        {t('prompt')}
        <textarea
          name="prompt"
          rows={2}
          required
          defaultValue={localization?.prompt ?? ''}
          className="staff-input mt-1"
        />
      </label>
      {KEYS.map((key) => (
        <label key={key} className="text-sm">
          {t('option', { key })}
          <input name={`option_${key}`} defaultValue={textFor(key)} className="staff-input mt-1" />
        </label>
      ))}
      <label className="text-sm">
        {t('correctKey')}
        <select
          name="correctKey"
          defaultValue={localization?.correct_key ?? 'A'}
          className="staff-input mt-1"
        >
          {KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        {t('explanation')}
        <textarea
          name="explanation"
          rows={2}
          defaultValue={localization?.explanation ?? ''}
          className="staff-input mt-1"
        />
      </label>
      {language === 'th' && (
        <label className="flex items-center gap-2 text-sm">
          <input
            name="ttsEnabled"
            type="checkbox"
            defaultChecked={localization?.tts_enabled ?? false}
          />
          {t('ttsEnabled')}
        </label>
      )}
      <p className="text-xs text-ink-500">
        {t('placeholderHint')} <code>{PLACEHOLDER_EXAMPLES}</code>
      </p>
      <Feedback state={state} savedLabel={t('saved')} />
      <button type="submit" disabled={pending} className="staff-btn">
        {t('saveLanguage')}
      </button>
    </form>
  );
}

const fillInitial: FillState = { ok: false, error: null, written: [] };
const FILL_ERRORS = ['not_configured', 'provider', 'invalid_output', 'no_material'];

/** Translates the written language(s) into the missing ones with the question generator (P11). */
export function FillMissingLanguagesForm({
  questionId,
  missing,
}: {
  questionId: string;
  missing: AppLocale[];
}) {
  const locale = useLocale();
  const t = useTranslations('admin.questions');
  const [state, formAction, pending] = useActionState(fillMissingLanguagesAction, fillInitial);
  // Once everything is filled the form only needs to keep showing what it just did.
  if (missing.length === 0 && !state.ok) return null;
  return (
    <form action={formAction} className="staff-card grid max-w-md gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="questionId" value={questionId} />
      {missing.length > 0 && (
        <p className="text-sm">
          {t('fillMissingHint', {
            languages: missing.map((l) => LANGUAGE_LABELS[l]).join(', '),
          })}
        </p>
      )}
      {state.error && (
        <p role="alert" data-testid="fill-error" className="text-sm text-bad-600">
          {FILL_ERRORS.includes(state.error)
            ? t(`fillErrors.${state.error}` as 'fillErrors.not_configured')
            : state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" data-testid="fill-done" className="text-sm text-ok-600">
          {t('fillDone', { count: state.written.length })}
        </p>
      )}
      {missing.length > 0 && (
        <button
          type="submit"
          disabled={pending}
          data-testid="fill-missing"
          className="staff-btn-ghost justify-self-start"
        >
          {pending ? t('filling') : t('fillMissing')}
        </button>
      )}
    </form>
  );
}
