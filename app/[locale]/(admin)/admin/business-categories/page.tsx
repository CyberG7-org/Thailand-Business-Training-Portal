import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { listBusinessCategories } from '@/lib/db/business-categories';
import { createSupabaseServerClient } from '@/lib/db/server';
import { CategoryRowForm, NewCategoryForm } from './category-form';

/** The Owner's business-category dictionary (spec §5.3, D73). */
export default async function BusinessCategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAdmin(locale);
  const categories = await listBusinessCategories(await createSupabaseServerClient());
  const t = await getTranslations('admin.businessCategories');
  return (
    <section className="grid gap-6">
      <h1 className="staff-title">{t('title')}</h1>
      <p className="staff-intro">{t('intro')}</p>
      <NewCategoryForm />
      <ul className="grid gap-3" data-testid="category-list">
        {categories.map((c) => (
          <li key={c.key}>
            <CategoryRowForm category={c} />
          </li>
        ))}
      </ul>
    </section>
  );
}
