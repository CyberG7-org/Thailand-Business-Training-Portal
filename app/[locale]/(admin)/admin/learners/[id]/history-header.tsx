import { Link } from '@/i18n/navigation';
import { displayLoginId } from '@/lib/domain/login-id';

/** The top of a learner's history page (D82): the way back, the title, and whose it is. */
export function HistoryHeader({
  back,
  title,
  learner,
}: {
  back: { href: string; label: string };
  title: string;
  learner: { loginId: string; companyNameTh: string | null };
}) {
  return (
    <div className="grid gap-2">
      <Link href={back.href} className="staff-link text-sm" data-testid="history-back">
        {back.label}
      </Link>
      <h1 className="staff-title">{title}</h1>
      <p className="text-sm text-ink-700" data-testid="history-learner">
        {displayLoginId(learner.loginId)}
        {learner.companyNameTh ? ` · ${learner.companyNameTh}` : ''}
      </p>
    </div>
  );
}
