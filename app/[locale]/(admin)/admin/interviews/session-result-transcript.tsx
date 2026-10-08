'use client';

import {
  ChatCircleDotsIcon,
  CheckCircleIcon,
  UserCircleIcon,
  WarningCircleIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import type { Verdict } from '@/lib/domain/interview/types';

const PASSING_VERDICTS = new Set<Verdict>(['correct']);

const tone: Record<Verdict, { border: string; badge: string; icon: typeof CheckCircleIcon }> = {
  correct: {
    border: 'border-ink-100',
    badge: 'bg-ok-50 text-ok-600',
    icon: CheckCircleIcon,
  },
  partial: {
    border: 'border-warn-600/35',
    badge: 'bg-warn-50 text-warn-700',
    icon: WarningCircleIcon,
  },
  wrong: {
    border: 'border-bad-600/45',
    badge: 'bg-bad-50 text-bad-600',
    icon: XCircleIcon,
  },
  evasive: {
    border: 'border-warn-600/35',
    badge: 'bg-warn-50 text-warn-700',
    icon: WarningCircleIcon,
  },
  pasted: {
    border: 'border-bad-600/45',
    badge: 'bg-bad-50 text-bad-600',
    icon: XCircleIcon,
  },
  off_topic: {
    border: 'border-ink-300',
    badge: 'bg-ink-100 text-ink-700',
    icon: WarningCircleIcon,
  },
};

export type InterviewResultItem = {
  id: string;
  question: string;
  questionHint: string | null;
  answer: string;
  verdict: Verdict | null;
  note: string | null;
  expected: string | null;
};

export function SessionResultTranscript({
  items,
  labels,
}: {
  items: InterviewResultItem[];
  labels: {
    title: string;
    intro: string;
    explanation: string;
    expected: string;
    unanswered: string;
    verdicts: Record<Verdict, string>;
  };
}) {
  return (
    <section className="overflow-hidden rounded-card bg-white shadow-raised">
      <div className="flex flex-col gap-3 border-b border-brand-100 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
        <div>
          <h2 className="font-display text-xl font-semibold text-brand-900">{labels.title}</h2>
          <p className="mt-1 text-sm leading-6 text-ink-500">{labels.intro}</p>
        </div>
      </div>

      <div data-testid="admin-transcript" className="grid gap-3 p-4 md:p-5">
        {items.map((item, index) => {
          const visual = item.verdict ? tone[item.verdict] : null;
          const StatusIcon = visual?.icon ?? WarningCircleIcon;
          const needsExplanation = item.verdict && !PASSING_VERDICTS.has(item.verdict);
          return (
            <article
              key={item.id}
              data-testid="interview-result-question"
              className={`rounded-card border bg-white p-3 shadow-glass md:p-4 ${visual?.border ?? 'border-ink-100'}`}
            >
              <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-2.5 md:grid-cols-[36px_minmax(0,1fr)_auto]">
                <span className="grid size-8 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                  {index + 1}
                </span>
                <ol className="grid min-w-0 gap-2.5">
                  <li
                    data-role="officer"
                    className="grid grid-cols-[30px_minmax(0,1fr)] items-start gap-2.5 rounded-control bg-brand-50 px-3 py-2.5"
                  >
                    <span className="grid size-7 place-items-center rounded-full bg-white text-brand-600">
                      <ChatCircleDotsIcon size={17} weight="bold" />
                    </span>
                    <div className="min-w-0">
                      <p lang="th" className="font-medium text-brand-900">
                        {item.question}
                      </p>
                      {item.questionHint && item.questionHint !== item.question && (
                        <p className="mt-0.5 text-xs leading-5 text-ink-500">{item.questionHint}</p>
                      )}
                    </div>
                  </li>
                  <li
                    data-role="learner"
                    className="grid grid-cols-[30px_minmax(0,1fr)] items-start gap-2.5 rounded-control bg-gold-100/45 px-3 py-2.5"
                  >
                    <span className="grid size-7 place-items-center rounded-full bg-white text-gold-700">
                      <UserCircleIcon size={18} weight="bold" />
                    </span>
                    <p lang="th" className="pt-0.5 font-medium text-ink-900">
                      {item.answer || labels.unanswered}
                    </p>
                  </li>
                </ol>
                {item.verdict && visual && (
                  <span
                    data-verdict={item.verdict}
                    className={`col-start-2 inline-flex w-fit items-center gap-1.5 self-start rounded-control px-3 py-2 text-xs font-semibold md:col-start-3 md:row-start-1 ${visual.badge}`}
                  >
                    <StatusIcon size={16} weight="fill" />
                    {labels.verdicts[item.verdict]}
                  </span>
                )}
              </div>

              {needsExplanation && (item.note || item.expected) && (
                <div className="mt-3 ml-[46px] grid grid-cols-[30px_minmax(0,1fr)] gap-2.5 rounded-control bg-bad-50 px-3 py-2.5 text-bad-600">
                  <span className="grid size-7 place-items-center rounded-full bg-bad-600 text-white">
                    <WarningCircleIcon size={17} weight="fill" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold">{labels.explanation}</p>
                    {item.note && (
                      <p lang="th" className="mt-1 text-sm leading-6 text-ink-700">
                        {item.note}
                      </p>
                    )}
                    {item.expected && (
                      <p className="mt-1 text-sm leading-6 text-ink-700">
                        <span className="font-medium text-ink-900">{labels.expected}: </span>
                        {item.expected}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
