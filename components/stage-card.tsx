import { Link } from '@/i18n/navigation';
import type { StageInfo, StageKey } from '@/lib/domain/progression';

const STATUS_STYLES: Record<StageInfo['status'], string> = {
  locked: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-800',
  available: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-blue-100 text-blue-800',
  done: 'bg-green-100 text-green-800',
};

export function StageCard({
  stage,
  info,
  title,
  statusLabel,
  detail,
  href,
  actionLabel,
}: {
  stage: StageKey;
  info: StageInfo;
  title: string;
  statusLabel: string;
  detail: string | null;
  /** null when the stage's screens are not built yet or the stage is locked. */
  href: string | null;
  actionLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded border p-4" data-testid={`stage-${stage}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <span
          className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[info.status]}`}
          data-testid={`stage-${stage}-status`}
        >
          {statusLabel}
        </span>
      </div>
      {detail && <p className="text-sm text-gray-700">{detail}</p>}
      {href && (
        <Link href={href} className="mt-auto text-sm underline">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
