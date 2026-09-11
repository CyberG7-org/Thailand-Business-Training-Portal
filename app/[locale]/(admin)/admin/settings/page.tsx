import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { POLICY_FIELDS, formatPolicyValue } from '@/lib/config/policy-schema';
import { createSupabaseServerClient } from '@/lib/db/server';
import { listPolicies } from '@/lib/db/settings';
import { SettingForm } from './setting-form';

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireAdmin(locale);
  const rows = await listPolicies(await createSupabaseServerClient());
  const t = await getTranslations('admin.settings');
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="max-w-2xl text-sm text-gray-700">{t('intro')}</p>
      <div className="grid max-w-3xl gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <SettingForm
            key={row.key}
            policyKey={row.key}
            control={POLICY_FIELDS[row.key].control}
            value={formatPolicyValue(row.key, row.value)}
            updatedAt={row.updated_at}
          />
        ))}
      </div>
    </section>
  );
}
