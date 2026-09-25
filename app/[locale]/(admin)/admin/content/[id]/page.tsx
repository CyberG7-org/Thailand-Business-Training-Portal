import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LOCALES } from '@/i18n/routing';
import { requireStaff } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import { listStudyMaterials, pickLocalization } from '@/lib/db/study';
import { LocalizationForm } from '../localization-form';
import { MaterialForm } from '../material-form';

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  await requireStaff(locale);
  const material = (await listStudyMaterials(await createSupabaseServerClient())).find(
    (m) => m.id === id,
  );
  if (!material) notFound();
  const t = await getTranslations('admin.content');
  return (
    <section className="grid gap-6">
      <Link href="/admin/content" className="text-sm underline">
        ← {t('title')}
      </Link>
      <h1 className="text-2xl font-semibold">{material.content_key}</h1>
      <MaterialForm material={material} />
      <div className="grid gap-4 lg:grid-cols-3">
        {LOCALES.map((language) => (
          <LocalizationForm
            key={language}
            materialId={material.id}
            materialType={material.type as 'card' | 'pdf'}
            language={language}
            localization={pickLocalization(material, language)}
          />
        ))}
      </div>
    </section>
  );
}
