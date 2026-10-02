import { getTranslations } from 'next-intl/server';
import { CoveragePanel } from '@/app/[locale]/(admin)/admin/dbd-records/[id]/coverage-panel';
import { loadRecord } from '@/app/[locale]/(admin)/admin/dbd-records/[id]/record-data';
import {
  StatusCard,
  type AcceptanceCheck,
} from '@/app/[locale]/(admin)/admin/dbd-records/[id]/record-tools';
import { TrainingVersionsPanel } from '@/app/[locale]/(admin)/admin/dbd-records/[id]/training-versions-panel';
import { requireStaff } from '@/lib/auth/session';
import { countAssignmentsBehind, listVersions } from '@/lib/db/training-versions';
import { missingBusinessAnswers } from '@/lib/domain/bank-interview';
import { conceptCoverage } from '@/lib/domain/concepts/resolve';
import { buildFactSheet } from '@/lib/domain/facts/fact-sheet';

/**
 * A company record's status column, under the sidebar (the owner, 2026-10-02): where acceptance
 * stands, what the evaluations still miss, and the training versions. The record's tabs keep the
 * full width beside it. On a phone it sits between the sidebar strip and the record.
 */
export default async function RecordSide({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  await requireStaff(locale);
  const loaded = await loadRecord(id);
  // The page itself answers a missing record with its 404.
  if (!loaded) return null;
  const { db, record, structured, documents, exceptions, address } = loaded;
  const t = await getTranslations('admin.dbd');

  const coverage = conceptCoverage(
    buildFactSheet({ record, structured, address, role: null }),
    'company',
  );
  const versions = await listVersions(db, record.id);
  const activeVersion = versions.find((v) => v.status === 'active') ?? null;
  const behind = activeVersion ? await countAssignmentsBehind(db, record.id, activeVersion.id) : 0;
  const { data: confirmer } = record.confirmed_by
    ? await db
        .from('profiles')
        .select('display_name, login_id')
        .eq('id', record.confirmed_by)
        .maybeSingle()
    : { data: null };

  // Where acceptance stands (P17c), as the column's list.
  const acceptanceExceptions = exceptions.filter((e) => e.blocks === 'acceptance');
  const confirmed = record.extraction_status === 'confirmed';
  // Nothing can be called complete or clean before the documents are read: the checks run then.
  const read = documents.length > 0 && (record.extraction_raw !== null || confirmed);
  const checks: AcceptanceCheck[] = [
    { key: 'documents', label: t('checks.documents'), done: read },
    {
      key: 'missing',
      label: t('checks.missing'),
      done:
        read &&
        !acceptanceExceptions.some((e) => e.kind === 'missing') &&
        missingBusinessAnswers(structured.interview ?? null).length === 0,
    },
    {
      key: 'problems',
      label: t('checks.problems'),
      done: read && !acceptanceExceptions.some((e) => e.kind !== 'missing'),
    },
    { key: 'accepted', label: t('checks.accepted'), done: confirmed },
  ];

  return (
    <div data-staff-side className="grid gap-4">
      <StatusCard
        id={record.id}
        status={record.extraction_status}
        checks={checks}
        acceptance={{
          blockers: acceptanceExceptions.length,
          confirmedByName: confirmer?.display_name ?? confirmer?.login_id ?? null,
          automatic: record.confirmed_automatically,
        }}
      />
      <CoveragePanel coverage={coverage} compact />
      <TrainingVersionsPanel versions={versions} behind={behind} compact />
    </div>
  );
}
