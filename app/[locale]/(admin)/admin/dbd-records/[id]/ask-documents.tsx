'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { askDocumentsAction, type AskState } from '../actions';

const initial: AskState = { question: '', answer: null, passages: [], error: null };

/** Admin Q&A over the record's indexed documents — answers cite pages (P14, spec §8). */
export function AskDocuments({ recordId }: { recordId: string }) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd.ask');
  const [state, formAction, pending] = useActionState(askDocumentsAction, initial);
  return (
    <form
      action={formAction}
      className="staff-card grid max-w-2xl gap-3"
      data-testid="ask-documents"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={recordId} />
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-xs text-ink-500">{t('hint')}</p>
      <div className="flex gap-2">
        <input
          name="question"
          defaultValue={state.question}
          placeholder={t('placeholder')}
          maxLength={300}
          data-testid="ask-question"
          className="staff-input"
        />
        <button
          type="submit"
          disabled={pending}
          data-testid="ask-submit"
          className="staff-btn staff-btn-sm"
        >
          {pending ? t('asking') : t('submit')}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-bad-600">
          {t(`errors.${state.error}`)}
        </p>
      )}
      {!state.error && state.question && (
        <div className="grid gap-2 text-sm">
          <p data-testid="ask-answer" className="rounded-control bg-ink-50 p-3 whitespace-pre-wrap">
            {state.answer ?? t('noAnswer')}
          </p>
          {state.passages.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-500">{t('passages')}</p>
              <ol data-testid="ask-passages" className="grid gap-1">
                {state.passages.map((p, i) => (
                  <li key={i} className="rounded-control border border-ink-100 p-2">
                    <p className="text-xs text-ink-500">
                      {t('source', { document: p.document, page: p.page })}
                    </p>
                    <p className="whitespace-pre-wrap">{p.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
