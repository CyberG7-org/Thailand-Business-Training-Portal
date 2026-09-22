'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { MAX_GENERATION_COUNT as MAX_COUNT } from '@/lib/domain/generation-limits';
import { generateQuestionsAction, type GenerateState } from './actions';

const initial: GenerateState = { error: null, rejected: [] };
const KNOWN_ERRORS = [
  'not_configured',
  'provider',
  'invalid_output',
  'no_material',
  'pools_required',
  'file_too_large',
  'nothing_produced',
];

export function GenerateForm({
  cards,
  references,
}: {
  cards: { id: string; title: string }[];
  references: { id: string; label: string }[];
}) {
  const locale = useLocale();
  const t = useTranslations('admin.generate');
  const [state, formAction, pending] = useActionState(generateQuestionsAction, initial);
  const [count, setCount] = useState(10);
  const [templateCount, setTemplateCount] = useState(10);
  const inputClass = 'mt-1 w-full rounded border px-2 py-1';

  return (
    <form action={formAction} className="grid max-w-2xl gap-4 rounded border p-4">
      <input type="hidden" name="locale" value={locale} />

      <label className="text-sm">
        {t('reference')}
        <select
          name="reference_record_id"
          defaultValue={references[0]?.id ?? ''}
          data-testid="reference-record"
          className={inputClass}
        >
          <option value="">{t('referenceNone')}</option>
          {references.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500">{t('referenceHint')}</span>
      </label>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{t('material')}</legend>
        <p className="text-xs text-gray-600">{t('materialHint')}</p>
        {cards.length > 0 && (
          <div className="grid gap-1 rounded border p-2 text-sm" data-testid="study-card-picker">
            {cards.map((card) => (
              <label key={card.id} className="flex items-center gap-2">
                <input type="checkbox" name="study_material_ids" value={card.id} />
                {card.title}
              </label>
            ))}
          </div>
        )}
        <label className="text-sm">
          {t('pastedText')}
          <textarea
            name="pasted_text"
            rows={5}
            className={inputClass}
            placeholder={t('pastedHint')}
          />
        </label>
        <label className="text-sm">
          {t('file')}
          <input
            type="file"
            name="material_file"
            accept=".pdf,.docx,.txt,.md"
            className="mt-1 block w-full text-sm"
          />
          <span className="text-xs text-gray-500">{t('fileHint')}</span>
        </label>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          {t('count')}
          <input
            name="count"
            type="number"
            min={1}
            max={MAX_COUNT}
            value={count}
            onChange={(e) => {
              const next = Math.max(1, Math.min(MAX_COUNT, Number(e.target.value) || 1));
              setCount(next);
              setTemplateCount((current) => Math.min(current, next));
            }}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          {t('templateCount')}
          <input
            name="templateCount"
            type="number"
            min={0}
            max={count}
            value={templateCount}
            onChange={(e) =>
              setTemplateCount(Math.max(0, Math.min(count, Number(e.target.value) || 0)))
            }
            data-testid="template-count"
            className={inputClass}
          />
          <span className="text-xs text-gray-500">{t('templateHint')}</span>
        </label>
        <label className="text-sm">
          {t('difficulty')}
          <select name="difficulty" defaultValue="medium" className={inputClass}>
            <option value="easy">{t('difficultyEasy')}</option>
            <option value="medium">{t('difficultyMedium')}</option>
            <option value="hard">{t('difficultyHard')}</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <span>{t('pools')}:</span>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="pools" value="quiz" defaultChecked /> {t('poolQuiz')}
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="pools" value="exam" defaultChecked /> {t('poolExam')}
        </label>
      </div>

      <label className="text-sm">
        {t('focus')}
        <input name="focus" className={inputClass} placeholder={t('focusHint')} />
      </label>

      {state.error && (
        <div role="alert" data-testid="generate-error" className="text-sm text-red-700">
          {KNOWN_ERRORS.includes(state.error)
            ? t(`errors.${state.error}` as 'errors.no_material')
            : state.error}
          {state.rejected.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {state.rejected.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        data-testid="generate-submit"
        className="justify-self-start rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? t('generating') : t('generate')}
      </button>
    </form>
  );
}
