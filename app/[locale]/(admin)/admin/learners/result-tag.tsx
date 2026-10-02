import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { ChatbotSessionResult, McqResult } from '@/lib/domain/learner-record';

type Result = ChatbotSessionResult | McqResult;

const TONE: Record<Result, string> = {
  pass: 'bg-ok-50 text-ok-600',
  retest: 'bg-warn-50 text-warn-700',
  fail: 'bg-bad-50 text-bad-600',
  in_progress: 'bg-brand-100 text-brand-700',
  abandoned: 'bg-ink-100 text-ink-700',
};

/**
 * A result as the Learner Record shows it (D82): a coloured tag, which links to the history
 * when there is one; "—" when there is no result yet. The tag's colour is never the only
 * signal — it always carries the word.
 */
export async function ResultTag({ result, href }: { result: Result | null; href?: string | null }) {
  const t = await getTranslations('admin.learners.results');
  // The link fills a 44px row so a thumb can hit it; the tag inside stays compact.
  const hit = 'inline-flex min-h-11 items-center rounded-control focus-visible:outline-brand-600';
  if (!result) {
    return href ? (
      <Link href={href} className={`staff-link ${hit}`}>
        —
      </Link>
    ) : (
      <span>—</span>
    );
  }
  const tag = (
    <span data-result={result} className={`staff-tag text-sm whitespace-nowrap ${TONE[result]}`}>
      {t(result)}
    </span>
  );
  return href ? (
    <Link href={href} className={hit}>
      {tag}
    </Link>
  ) : (
    tag
  );
}
