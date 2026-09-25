import { displayLoginId } from '@/lib/domain/login-id';
import { getTranslations } from 'next-intl/server';
import { requireStaff } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import { auditDiff, listAuditLogs } from '@/lib/db/settings';

const ENTITY_TYPES = [
  'dbd_records',
  'user_dbd_assignments',
  'policy_config',
  'profiles',
  'study_materials',
  'study_material_localizations',
  'questions',
  'question_localizations',
];

function short(value: unknown): string {
  if (value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ entity?: string; id?: string; actor?: string }>;
}) {
  const { locale } = await params;
  const { entity, id, actor } = await searchParams;
  // Spec §9: the admin reads everything, a manager reads their own team. The view is
  // security_invoker, so the P15a policy on audit_logs does the narrowing.
  await requireStaff(locale);
  const rows = await listAuditLogs(await createSupabaseServerClient(), {
    entityType: entity || undefined,
    entityId: id || undefined,
    actorLoginId: actor || undefined,
  });
  const t = await getTranslations('admin.audit');
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <label>
          {t('entity')}
          <select
            name="entity"
            defaultValue={entity ?? ''}
            className="mt-1 block rounded border px-2 py-1"
          >
            <option value="">{t('all')}</option>
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('entityId')}
          <input
            name="id"
            defaultValue={id ?? ''}
            className="mt-1 block rounded border px-2 py-1 font-mono"
          />
        </label>
        <label>
          {t('actor')}
          <input
            name="actor"
            defaultValue={actor ?? ''}
            className="mt-1 block rounded border px-2 py-1"
          />
        </label>
        <button type="submit" className="rounded border px-3 py-1">
          {t('filter')}
        </button>
      </form>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-600">{t('empty')}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">{t('when')}</th>
              <th>{t('actor')}</th>
              <th>{t('action')}</th>
              <th>{t('entityId')}</th>
              <th>{t('changes')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const diff = auditDiff(row.before, row.after);
              return (
                <tr key={row.id} className="border-b align-top" data-testid={`audit-${row.id}`}>
                  <td className="py-2 whitespace-nowrap">
                    {row.created_at ? new Date(row.created_at).toLocaleString(locale) : ''}
                  </td>
                  <td>{row.actor_login_id ? displayLoginId(row.actor_login_id) : t('system')}</td>
                  <td data-testid="audit-action">{row.action}</td>
                  <td className="font-mono text-xs">{row.entity_id}</td>
                  <td>
                    {diff.length === 0 ? (
                      <span className="text-gray-500">—</span>
                    ) : (
                      <details>
                        <summary className="cursor-pointer">
                          {t('changed', { count: diff.length })}
                        </summary>
                        <ul className="mt-1 grid gap-1 font-mono text-xs">
                          {diff.map((d) => (
                            <li key={d.key} data-testid="audit-diff">
                              <span className="font-semibold">{d.key}</span>: {short(d.before)} →{' '}
                              {short(d.after)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
