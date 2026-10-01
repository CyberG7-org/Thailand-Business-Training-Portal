import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { conceptTitle, MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import { VariantForm } from '../../variant-form';

export default async function NewVariantPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ concept?: string }>;
}) {
  const { locale } = await params;
  const { concept } = await searchParams;
  await requireAdmin(locale);
  const def = MCQ_CONCEPTS.find((c) => c.key === concept);
  if (!def) notFound();
  const t = await getTranslations('admin.bank');
  return (
    <section className="grid gap-5">
      <Link href={`/admin/questions/concepts/${def.key}`} className="staff-link text-sm">
        ← {def.mcqOrder}. {conceptTitle(def.key, locale)}
      </Link>
      <h1 className="staff-title">{t('variant.new')}</h1>
      <VariantForm conceptKey={def.key} statusFacts={def.alternateWhen} variant={null} />
    </section>
  );
}
