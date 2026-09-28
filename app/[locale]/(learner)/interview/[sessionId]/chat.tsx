'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { endInterviewAction, sendMessageAction, type Budget, type ChatTurn } from '../actions';

const BUBBLE = {
  officer:
    'max-w-[85%] rounded-card rounded-tl-sm bg-brand-50 px-4 py-3 text-base leading-[1.75] text-ink-900',
  learner:
    'ml-auto max-w-[85%] rounded-card rounded-tr-sm bg-brand-700 px-4 py-3 text-base leading-[1.75] text-white',
} as const;

/**
 * The conversation (spec §9): officer bubbles on the left, the learner's on the right, a typing
 * indicator while the officer's reply is on its way, and the input bar pinned to the bottom of
 * a phone. Glass on the bar only; the bubbles and the textarea are solid.
 */
export function Chat({
  sessionId,
  initialTurns,
  maxChars,
  initialBudget,
}: {
  sessionId: string;
  initialTurns: ChatTurn[];
  maxChars: number;
  /** Learner messages sent so far and the session's limit (spec §4.3: shown, not silently cut). */
  initialBudget: Budget;
}) {
  const locale = useLocale();
  const t = useTranslations('interview');
  const router = useRouter();
  const [turns, setTurns] = useState(initialTurns);
  const [budget, setBudget] = useState(initialBudget);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns, pending]);

  const send = () => {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft('');
    setError(null);
    setTurns((prev) => [...prev, { id: 'pending', role: 'learner', content: text, concept: null }]);
    startTransition(async () => {
      const result = await sendMessageAction(locale, sessionId, text);
      if (!result.ok) {
        // An idle session was abandoned server-side: the page now renders it as such.
        if (result.error === 'expired') {
          router.refresh();
          return;
        }
        setTurns((prev) => prev.filter((turn) => turn.id !== 'pending'));
        setDraft(text);
        setError(result.error);
        return;
      }
      // A closed session becomes the debrief: the server page renders it on refresh.
      if (result.closed) {
        router.refresh();
        return;
      }
      setTurns(result.turns);
      setBudget(result.budget);
    });
  };

  const end = () => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await endInterviewAction(locale, sessionId);
      if (result.error && result.error !== 'expired') setError(result.error);
      else router.refresh();
    });
  };

  return (
    <div className="mx-auto grid max-w-[780px] gap-4">
      <section className="rise rounded-card bg-white shadow-raised">
        <ol
          data-testid="chat-log"
          aria-live="polite"
          className="grid gap-3 px-4 py-5 md:max-h-[60vh] md:overflow-y-auto md:px-6"
        >
          {turns.map((turn) => (
            <li
              key={turn.id}
              data-testid="chat-message"
              data-role={turn.role}
              data-concept={turn.concept ?? undefined}
              className={BUBBLE[turn.role]}
            >
              <span
                className={
                  'mb-1 block text-xs font-semibold ' +
                  (turn.role === 'officer' ? 'text-brand-700' : 'text-brand-100')
                }
              >
                {turn.role === 'officer' ? t('chat.officer') : t('chat.you')}
              </span>
              <p lang="th" className="whitespace-pre-wrap">
                {turn.content}
              </p>
            </li>
          ))}
          {pending && (
            <li
              data-testid="chat-typing"
              role="status"
              className="max-w-[85%] rounded-card rounded-tl-sm bg-brand-50 px-4 py-3 text-sm text-ink-700"
            >
              {t('chat.typing')}
            </li>
          )}
          <div ref={endRef} aria-hidden="true" />
        </ol>
      </section>
      {error && (
        <p
          role="alert"
          className="rounded-control bg-bad-50 px-3.5 py-2.5 text-sm font-medium text-bad-600"
        >
          {t(`errors.${error}` as never)}
        </p>
      )}
      <div className="glass-strong sticky bottom-2 rounded-card p-3 md:static md:p-4">
        <textarea
          data-testid="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          maxLength={maxChars}
          rows={2}
          lang="th"
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.placeholder')}
          className="w-full resize-none rounded-control border border-ink-300 bg-white px-3.5 py-2.5 text-base leading-[1.6] text-ink-900 placeholder:text-ink-500"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-500 tabular-nums">
            <span data-testid="chat-budget">
              {t('chat.budget', { n: budget.used + 1, max: budget.max })}
            </span>
            {' · '}
            {t('chat.limit', { max: maxChars })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="chat-end"
              onClick={end}
              disabled={pending}
              className="inline-flex min-h-11 items-center rounded-control border border-ink-300 px-4 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-60"
            >
              {t('chat.end')}
            </button>
            <button
              type="button"
              data-testid="chat-send"
              onClick={send}
              disabled={pending || draft.trim().length === 0}
              className="inline-flex min-h-11 items-center rounded-control bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {t('chat.send')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
